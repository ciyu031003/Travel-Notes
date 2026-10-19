import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * B4：服务端幂等（Idempotency-Key → ClientMutation 去重）。
 *
 * 契约：
 *  · 没带键 / 键非法 → 正常执行一次（幂等是增强，不能因缺键拒绝创建）；
 *  · 同键命中 → 直接返回首次 entityId，**不执行创建**（响应结构由路由保持不变）；
 *  · 同键首次 → 执行创建并记录 entityId（记录失败不影响创建成功）；
 *  · 创建抛错 → 释放占位，客户端可重试；
 *  · 并发同键（唯一键冲突）→ 等待先到请求写入的 entityId，命中后重放。
 */
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    clientMutation: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

import { readIdempotencyKey, withIdempotency } from '@/lib/api/idempotency'

function reqWithKey(key?: string): Request {
  const headers = new Headers()
  if (key !== undefined) headers.set('idempotency-key', key)
  return new Request('http://example.com/api/x', { method: 'POST', headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.clientMutation.create.mockResolvedValue({})
  prismaMock.clientMutation.update.mockResolvedValue({})
  prismaMock.clientMutation.delete.mockResolvedValue({})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('readIdempotencyKey', () => {
  it('缺失 → null；合法 UUID → 原值；过短/非法字符 → null（按无幂等处理）', () => {
    expect(readIdempotencyKey(reqWithKey())).toBeNull()
    const uuid = '3f2b7a1e-9c4d-4a1f-9b2e-1a2b3c4d5e6f'
    expect(readIdempotencyKey(reqWithKey('  ' + uuid + '  '))).toBe(uuid)
    expect(readIdempotencyKey(reqWithKey('short'))).toBeNull()
    expect(readIdempotencyKey(reqWithKey('bad key with spaces 123'))).toBeNull()
    expect(readIdempotencyKey(reqWithKey('x'.repeat(129)))).toBeNull()
  })
})

describe('withIdempotency', () => {
  it('无幂等键 → 执行一次，不读写 ClientMutation', async () => {
    const run = vi.fn(async () => ({ entityId: 7, value: { slug: 'a' } }))
    const result = await withIdempotency({ key: null, userId: 1, entityType: 'Travel', run })
    expect(run).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ entityId: 7, value: { slug: 'a' }, replayed: false })
    expect(prismaMock.clientMutation.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.clientMutation.create).not.toHaveBeenCalled()
  })

  it('同键命中 → 返回已有 entityId，不执行创建', async () => {
    prismaMock.clientMutation.findUnique.mockResolvedValue({ id: 'k-12345678', entityId: 42 })
    const run = vi.fn(async () => ({ entityId: 99, value: null }))
    const result = await withIdempotency({ key: 'k-12345678', userId: 1, entityType: 'Travel', run })
    expect(result).toEqual({ entityId: 42, replayed: true })
    expect(run).not.toHaveBeenCalled()
  })

  it('同键首次 → 执行创建并记录 entityId', async () => {
    prismaMock.clientMutation.findUnique.mockResolvedValue(null)
    const run = vi.fn(async () => ({ entityId: 7, value: 'nanjing' }))
    const result = await withIdempotency({ key: 'k-abcdefgh', userId: 3, entityType: 'Travel', run })
    expect(result).toEqual({ entityId: 7, value: 'nanjing', replayed: false })
    expect(prismaMock.clientMutation.create).toHaveBeenCalledWith({
      data: { id: 'k-abcdefgh', userId: 3, entityType: 'Travel' },
    })
    expect(prismaMock.clientMutation.update).toHaveBeenCalledWith({
      where: { id: 'k-abcdefgh' },
      data: { entityId: 7 },
    })
  })

  it('创建抛错 → 删除占位并重新抛出（允许客户端重试）', async () => {
    prismaMock.clientMutation.findUnique.mockResolvedValue(null)
    const run = vi.fn(async () => {
      throw new Error('创建失败')
    })
    await expect(withIdempotency({ key: 'k-errortest', userId: 1, entityType: 'Moment', run })).rejects.toThrow('创建失败')
    expect(prismaMock.clientMutation.delete).toHaveBeenCalledWith({ where: { id: 'k-errortest' } })
  })

  it('幂等表不可用（create 非 P2002 失败）→ 降级为无幂等执行，创建仍成功', async () => {
    prismaMock.clientMutation.findUnique.mockResolvedValue(null)
    prismaMock.clientMutation.create.mockRejectedValue(
      Object.assign(new Error('The table ClientMutation does not exist'), { code: 'P2021' }),
    )
    const run = vi.fn(async () => ({ entityId: 11, value: 'slug-11' }))
    const result = await withIdempotency({ key: 'k-tablemiss', userId: 1, entityType: 'Travel', run })
    expect(result).toEqual({ entityId: 11, value: 'slug-11', replayed: false })
    expect(prismaMock.clientMutation.update).not.toHaveBeenCalled()
  })

  it('记录 entityId 失败不影响创建结果（只影响后续去重）', async () => {
    prismaMock.clientMutation.findUnique.mockResolvedValue(null)
    prismaMock.clientMutation.update.mockRejectedValue(new Error('db down'))
    const result = await withIdempotency({
      key: 'k-updataboom',
      userId: 1,
      entityType: 'Album',
      run: async () => ({ entityId: 5, value: null }),
    })
    expect(result.replayed).toBe(false)
    expect(result.entityId).toBe(5)
  })

  it('并发同键（唯一键冲突）→ 等待先到请求写回 entityId 后重放', async () => {
    vi.useFakeTimers()
    prismaMock.clientMutation.findUnique
      .mockResolvedValueOnce(null) // 首次查：未命中
      .mockResolvedValueOnce({ id: 'k-concurrent', entityId: null }) // 占位存在、尚未写回
      .mockResolvedValue({ id: 'k-concurrent', entityId: 88 }) // 等待期间先到请求已写回
    prismaMock.clientMutation.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }))
    const run = vi.fn(async () => ({ entityId: 1, value: null }))

    const pending = withIdempotency({ key: 'k-concurrent', userId: 1, entityType: 'Memory', run })
    // 等待循环是 100ms 一轮：第二轮才会读到先到请求写回的 entityId
    await vi.advanceTimersByTimeAsync(300)

    await expect(pending).resolves.toEqual({ entityId: 88, replayed: true })
    expect(run).not.toHaveBeenCalled()
  })
})
