/**
 * 「在线直写成功后必须清队列」回归 —— 防止**数据重复**。
 *
 * 背景（我在 1.16.2/1.16.3 的"在线优先"改造里引入过的高危缺陷）：
 * `writeLocalEntity` 会「写本地 + 入队」，而我随后又把同一条直接写到了服务端。
 * 队列项没清掉 → SyncEngine 稍后再上传一次 → 用户看到两份：
 *   · 旅行变成"标题"和"标题-2"两本
 *   · 回忆/相册/碎碎念各出现一条重复
 *
 * 契约：在线成功 ⇒ 该实体的队列项必须消失；在线失败 ⇒ 队列项必须保留（联网后补传）；
 *       且只清自己的，不误删其他实体。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { nativeRef, storageBox } = vi.hoisted(() => ({
  nativeRef: { value: true },
  storageBox: { instance: null as unknown },
}))

vi.mock('@/lib/modules/offline/platform', () => ({ isNativePlatform: () => nativeRef.value }))
vi.mock('@/lib/modules/offline/storage', () => ({ getSyncQueueStorage: () => storageBox.instance }))

import { InMemorySyncQueueStorage, SyncQueue } from '@/lib/modules/offline/sync-queue'
import { writeThrough } from '@/lib/modules/offline/write-through'

function freshQueue(): SyncQueue {
  storageBox.instance = new InMemorySyncQueueStorage()
  return new SyncQueue(storageBox.instance as InMemorySyncQueueStorage)
}

async function enqueue(queue: SyncQueue, entityId: string, entityType = 'TRAVEL') {
  await queue.enqueue({
    entityType: entityType as never,
    entityId,
    remoteId: null,
    operation: 'CREATE',
    payload: { any: 1 },
  })
}

beforeEach(() => {
  nativeRef.value = true
})

describe('writeThrough · 队列去重', () => {
  it('在线成功 → 清掉本地写产生的队列项（不会被再上传一次）', async () => {
    const queue = freshQueue()
    const entityId = 'local-aaa'
    const r = await writeThrough<number>({
      entityId,
      localWrite: async () => {
        await enqueue(queue, entityId)
      },
      serverWrite: async () => ({ ok: true, data: 42 }),
    })
    expect(r.mode).toBe('server')
    expect(await queue.all()).toHaveLength(0)
    expect(await queue.pending()).toHaveLength(0)
  })

  it('在线失败 → 保留队列项（联网后由 SyncEngine 补传）', async () => {
    const queue = freshQueue()
    const entityId = 'local-bbb'
    const r = await writeThrough({
      entityId,
      localWrite: async () => {
        await enqueue(queue, entityId)
      },
      serverWrite: async () => ({ ok: false, error: '网络不可用' }),
    })
    expect(r.mode).toBe('local')
    expect(await queue.pending()).toHaveLength(1)
    expect((await queue.pending())[0].entityId).toBe(entityId)
  })

  it('只清自己的队列项，不误删其他实体', async () => {
    const queue = freshQueue()
    await enqueue(queue, 'other-1')
    await enqueue(queue, 'other-2')
    const r = await writeThrough<number>({
      entityId: 'mine',
      localWrite: async () => {
        await enqueue(queue, 'mine')
      },
      serverWrite: async () => ({ ok: true, data: 1 }),
    })
    expect(r.mode).toBe('server')
    const left = await queue.all()
    expect(left).toHaveLength(2)
    expect(left.map((i) => i.entityId).sort()).toEqual(['other-1', 'other-2'])
  })

  it('本地写失败时没有队列项要清，也不应报错', async () => {
    const queue = freshQueue()
    const r = await writeThrough<number>({
      entityId: 'local-ccc',
      localWrite: async () => {
        await enqueue(queue, 'local-ccc')
        throw new Error('boom')
      },
      serverWrite: async () => ({ ok: true, data: 9 }),
    })
    // 本地写失败 → 视为没有本地落库，队列里的残留项要清掉才安全（避免重复创建）
    expect(r.mode).toBe('server')
    expect(await queue.all()).toHaveLength(0)
  })

  it('没有 entityId 时也能正常在线写（不清队列）', async () => {
    const queue = freshQueue()
    await enqueue(queue, 'keep-me')
    const r = await writeThrough<number>({ serverWrite: async () => ({ ok: true, data: 3 }) })
    expect(r.mode).toBe('server')
    expect(await queue.all()).toHaveLength(1)
  })
})
