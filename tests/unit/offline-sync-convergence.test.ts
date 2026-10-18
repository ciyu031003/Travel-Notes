/**
 * 同步失败收敛（P1-23）回归。
 *
 * 锁住三条真机后果：
 *  ① 服务端 4xx（校验/权限/已删除）**只试一次** —— 旧实现无限重试，队列只增不减；
 *  ② 重试次数到顶（MAX_SYNC_RETRY）进 DEAD，不再每 32 分钟骚扰一次；
 *  ③ 单轮最多 20 条，且请求带 20s 超时与幂等键。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/modules/offline/platform', () => ({ isNativePlatform: () => true }))
vi.mock('@/lib/modules/offline/native/network', () => ({ onNetworkChange: async () => () => {} }))
vi.mock('@/lib/modules/offline/local-write', () => ({ markEntitySynced: vi.fn(async () => {}) }))

import { SyncEngine } from '@/lib/modules/offline/sync-engine'
import { SyncQueue, InMemorySyncQueueStorage, MAX_SYNC_RETRY } from '@/lib/modules/offline/sync-queue'
import { HttpSyncDispatcher, SyncPermanentError } from '@/lib/modules/offline/sync-dispatcher'
import type { SyncQueueItem } from '@/lib/modules/offline/types'

function item(over: Partial<SyncQueueItem> = {}): Omit<SyncQueueItem, 'id'> {
  return {
    entityType: 'TRAVEL',
    entityId: 'local-1',
    remoteId: null,
    operation: 'CREATE',
    payload: JSON.stringify({ title: '大理' }),
    retryCount: 0,
    status: 'PENDING',
    lastError: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...over,
  } as Omit<SyncQueueItem, 'id'>
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('P1-23 · 4xx 立即 DEAD，不再无限重试', () => {
  it('永久失败（SyncPermanentError）→ 该项变 DEAD，且只上传一次', async () => {
    const storage = new InMemorySyncQueueStorage()
    await storage.add(item())
    const queue = new SyncQueue(storage)
    const upload = vi.fn(async () => {
      throw new SyncPermanentError('HTTP 422：标题不能为空')
    })
    const engine = new SyncEngine(queue, { upload } as never)

    await engine.sync()

    const all = await queue.all()
    expect(upload).toHaveBeenCalledTimes(1)
    expect(all[0].status).toBe('DEAD')
    expect(all[0].lastError).toContain('422')
  })

  it('可重试失败（5xx）→ FAILED；重试到上限后转 DEAD（不再无限退避）', async () => {
    const storage = new InMemorySyncQueueStorage()
    await storage.add(item())
    const queue = new SyncQueue(storage)
    const engine = new SyncEngine(queue, { upload: async () => { throw new Error('HTTP 503') } } as never)

    /**
     * 每轮 sync 的语义是"上传 PENDING → 退避到期的 FAILED 回 PENDING"，
     * 所以一次重试需要两轮：一轮上传失败、下一轮退避回队。这里跑 2 倍轮数确保打满上限。
     */
    for (let i = 0; i < (MAX_SYNC_RETRY + 2) * 2; i++) {
      // 把退避计时清零，模拟"每次到期"
      for (const q of await queue.all()) await storage.update(q.id, { updatedAt: 0 })
      await engine.sync()
    }

    const all = await queue.all()
    expect(all[0].status).toBe('DEAD')
    expect(all[0].retryCount).toBeGreaterThanOrEqual(MAX_SYNC_RETRY)
  })

  it('单轮最多 20 条（避免一轮长时间占着网络）', async () => {
    const storage = new InMemorySyncQueueStorage()
    for (let i = 0; i < 25; i++) await storage.add(item({ entityId: 'e-' + i }))
    const queue = new SyncQueue(storage)
    const upload = vi.fn(async () => ({ remoteId: 1 }))
    const engine = new SyncEngine(queue, { upload } as never)

    await engine.sync()

    expect(upload).toHaveBeenCalledTimes(20)
    expect((await queue.pending()).length).toBe(5)
  })
})

describe('P1-23 · 请求层：超时与幂等键', () => {
  it('fetch 抛 AbortError → 归类为"超时"可重试错误（不静默挂死）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    }))
    const dispatcher = new HttpSyncDispatcher()
    const queue = new SyncQueue(new InMemorySyncQueueStorage())
    const payload = JSON.stringify({ title: '大理' })
    await expect(
      dispatcher.upload({
        id: 1, entityType: 'TRAVEL', entityId: 'x', remoteId: null,
        operation: 'CREATE', payload, retryCount: 0, status: 'PENDING', lastError: null,
        createdAt: 0, updatedAt: 0,
      }),
    ).rejects.toThrow(/超时/)
    vi.unstubAllGlobals()
    void queue
  })

  it('入队即生成幂等键；请求头带 Idempotency-Key，请求体不含保留键', async () => {
    const storage = new InMemorySyncQueueStorage()
    const queue = new SyncQueue(storage)
    const id = await queue.enqueue({ entityType: 'TRAVEL', entityId: 'local-1', remoteId: null, operation: 'CREATE', payload: { title: '大理' } })
    const queued = (await queue.all()).find((i) => i.id === id)!
    expect(queued.payload).toContain('__clientMutationId')
    const mutationId = JSON.parse(queued.payload).__clientMutationId as string
    expect(mutationId).toBeTruthy()

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      redirected: false,
      json: async () => ({ id: 99, slug: 'da-li' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await new HttpSyncDispatcher().upload(queued)
    expect(res.remoteId).toBe(99)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(url)).toContain('/api/admin/travels')
    const headers = init.headers as Record<string, string>
    expect(headers['Idempotency-Key']).toBe(mutationId)
    const body = JSON.parse(String(init.body))
    expect(body.__clientMutationId).toBeUndefined()
    expect(body.title).toBe('大理')
    vi.unstubAllGlobals()
  })
})
