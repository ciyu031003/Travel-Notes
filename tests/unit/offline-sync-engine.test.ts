/**
 * 同步引擎的**阶段隔离**与**上传后回写容错**回归。
 *
 * 锁的是一个已被线上数据证实过的故障链：
 *   sync() 原先顺序是 `requeueDue() → uploadPending() → pullRemote()`，
 *   而 requeueDue 第一步就读本地队列。设备上本地 SQLite 异常时它抛错 →
 *   整个 sync() 中断 → uploadPending() 永远执行不到 → **用户创作永远到不了云端**
 *   （线上 `Travel=0` 就是后果），且 `void this.sync()` 把 rejection 吞掉，界面无声。
 *
 * 契约：
 *   ① 本地队列读失败，也必须把待上传项传上去（上传阶段先行且独立）；
 *   ② 拉取失败不能影响上传；
 *   ③ 上传成功后，本地回写（出队/回填/标记）失败**不得**导致该项留在队列里
 *      —— 否则下一轮重复上传，用户会看到两本同名旅行。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/modules/offline/platform', () => ({ isNativePlatform: () => true }))
vi.mock('@/lib/modules/offline/native/network', () => ({ onNetworkChange: async () => () => {} }))
vi.mock('@/lib/modules/offline/local-write', () => ({ markEntitySynced: vi.fn(async () => {}) }))

import { SyncEngine } from '@/lib/modules/offline/sync-engine'
import { SyncQueue, InMemorySyncQueueStorage } from '@/lib/modules/offline/sync-queue'
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

describe('SyncEngine · 阶段隔离', () => {
  it('本地队列读失败（all() 抛错）时，仍然必须把待上传项传上去', async () => {
    const storage = new InMemorySyncQueueStorage()
    await storage.add(item({ entityId: 'keep-1' }))
    const queue = new SyncQueue(storage)
    // 模拟设备上"本地库坏掉"：requeueDue 用的 all() 抛错
    const realList = storage.list.bind(storage)
    let listCalls = 0
    storage.list = async (status?: never) => {
      listCalls++
      // all() 无参调用 → 抛错；pending() 带 'PENDING' → 正常
      if (status === undefined) throw new Error('SQLITE_ERROR: no such table: sync_queue')
      return realList(status as never)
    }

    const upload = vi.fn(async () => ({ remoteId: 123, slug: 'da-li' }))
    const engine = new SyncEngine(queue, { upload } as never)

    await engine.sync()

    expect(upload).toHaveBeenCalledTimes(1)
    expect(listCalls).toBeGreaterThan(0)
  })

  it('拉取阶段抛错不影响上传', async () => {
    const storage = new InMemorySyncQueueStorage()
    await storage.add(item())
    const queue = new SyncQueue(storage)
    const upload = vi.fn(async () => ({ remoteId: 7 }))
    const engine = new SyncEngine(queue, { upload } as never, {
      pull: async () => {
        throw new Error('pull boom')
      },
    } as never)

    await engine.sync()
    expect(upload).toHaveBeenCalledTimes(1)
  })

  it('三个阶段都正常时统计正常写入', async () => {
    const storage = new InMemorySyncQueueStorage()
    await storage.add(item())
    const queue = new SyncQueue(storage)
    const engine = new SyncEngine(queue, { upload: async () => ({ remoteId: 1 }) } as never)
    await engine.sync()
    expect(engine.lastSyncStats?.written).toBe(0)
    expect(engine.lastError).toBeNull()
  })
})

describe('SyncEngine · 上传后回写容错', () => {
  it('上传成功后 markDone 抛错 → 该项不得回到可重传状态（否则会重复上传）', async () => {
    const storage = new InMemorySyncQueueStorage()
    await storage.add(item({ entityId: 'dup-risk' }))
    const queue = new SyncQueue(storage)
    // 出队失败（模拟本地库写失败）
    storage.remove = async () => {
      throw new Error('SQLITE_FULL')
    }

    const upload = vi.fn(async () => ({ remoteId: 55 }))
    const engine = new SyncEngine(queue, { upload } as never)

    await engine.sync()
    expect(upload).toHaveBeenCalledTimes(1)

    /**
     * 关键：反复"把退避计时清零 + 再同步"。
     *
     * 为什么要跑多轮：新实现把上传放在退避之前，所以即便状态被判错，
     * 同一轮内也来不及重传 —— 单跑一轮根本测不出问题。旧实现（上传后回写失败
     * 就标 FAILED）会在某一轮被重新入队，紧接着下一轮**二次上传**。
     */
    for (let round = 0; round < 3; round++) {
      for (const i of await queue.all()) {
        await storage.update(i.id, { updatedAt: 0 })
      }
      await engine.sync()
    }

    expect(upload, '上传成功后不应再次上传同一项（重复数据）').toHaveBeenCalledTimes(1)
  })

  it('上传本身失败 → 标记 FAILED 并保留（联网后重试）', async () => {
    const storage = new InMemorySyncQueueStorage()
    await storage.add(item())
    const queue = new SyncQueue(storage)
    const engine = new SyncEngine(queue, {
      upload: async () => {
        throw new Error('HTTP 500')
      },
    } as never)

    await engine.sync()
    const all = await queue.all()
    expect(all).toHaveLength(1)
    expect(all[0].status).toBe('FAILED')
    expect(all[0].lastError).toContain('HTTP 500')
  })
})
