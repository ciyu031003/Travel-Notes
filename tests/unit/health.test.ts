import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * B10：/api/health 三分支 + 迁移/存储子检查。
 * 部署门禁（server-rebuild.sh 的 curl -fsS 轮询）依赖这里的 503 语义：
 * 只有 DB、迁移、存储三者全绿才算就绪。
 */

const { prismaMock, storageMock } = vi.hoisted(() => ({
  prismaMock: { $queryRaw: vi.fn(), $queryRawUnsafe: vi.fn() },
  storageMock: { upload: vi.fn(), delete: vi.fn(), getUrl: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))
vi.mock('@/lib/infrastructure/storage', () => ({ getStorageService: () => storageMock }))

import { GET } from '@/app/api/health/route'

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }])
  prismaMock.$queryRawUnsafe.mockResolvedValue([])
  storageMock.upload.mockResolvedValue({ key: 'k', url: 'u', size: 2, contentType: 'text/plain' })
  storageMock.delete.mockResolvedValue(undefined)
})

afterEach(() => errorSpy.mockRestore())

describe('GET /api/health（B10）', () => {
  it('DB/迁移/存储全就绪 → 200 ok，且 uptime 不再是 null', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.db).toBe('ok')
    expect(body.migrations).toBe('ok')
    expect(body.migrationsPending).toBe(0)
    expect(body.storage).toBe('ok')
    expect(typeof body.uptime).toBe('number')
    expect(body.uptime).toBeGreaterThanOrEqual(0)
    // 存储探针必须写完就删，别在桶里/盘上堆垃圾
    expect(storageMock.upload).toHaveBeenCalledTimes(1)
    expect(storageMock.delete).toHaveBeenCalledTimes(1)
  })

  it('DB 不可用 → 503 degraded', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('db down'))
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('degraded')
    expect(body.db).toBe('fail')
  })

  it('存在未完成/已回滚迁移 → 503 degraded（半迁移的库不能对外服务）', async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValue([{ migration_name: '20261018120000_x' }])
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('degraded')
    expect(body.migrations).toBe('pending')
    expect(body.migrationsPending).toBe(1)
  })

  it('迁移状态无法确认（表缺失/查询异常）→ 503 degraded', async () => {
    prismaMock.$queryRawUnsafe.mockRejectedValue(new Error('P2021 table does not exist'))
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.migrations).toBe('unavailable')
    expect(body.db).toBe('ok')
  })

  it('存储不可写（上传失败）→ 503 degraded', async () => {
    storageMock.upload.mockRejectedValue(new Error('EACCES'))
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('degraded')
    expect(body.storage).toBe('fail')
  })
})
