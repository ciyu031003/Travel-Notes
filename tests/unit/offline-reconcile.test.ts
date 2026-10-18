/**
 * 离线状态对账（P1-24）回归。
 *
 * 锁住"进程被杀后能自愈"：
 *  ① 有 PENDING_UPLOAD 行、队列里没有它 → 启动对账补建，否则内容永远不上云；
 *  ② 卡在 SYNCING（上传中被杀）→ 超过 10min 回收为 PENDING，否则永远不动。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const box = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@/lib/modules/offline/platform', () => ({ isNativePlatform: () => true }))
vi.mock('@/lib/modules/offline/native/sqlite-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/modules/offline/native/sqlite-db')>()
  return { ...actual, getOfflineDb: async () => box.db }
})

import { SyncQueue, InMemorySyncQueueStorage } from '@/lib/modules/offline/sync-queue'
import { reconcileOfflineState, reclaimStaleSyncing, reconcilePendingUploads } from '@/lib/modules/offline/reconcile'
import { clearColumnCache } from '@/lib/modules/offline/native/sqlite-db'
import type { SyncQueueItem } from '@/lib/modules/offline/types'

const TRAVEL_COLUMNS = ['id', 'remoteId', 'title', 'slug', 'syncStatus', 'deleted', 'updatedAt']

function makeDb(pendingRows: Array<Record<string, unknown>>) {
  return {
    query: async (sql: string) => {
      if (sql.includes('PRAGMA table_info')) {
        return { values: TRAVEL_COLUMNS.map((name, cid) => ({ cid, name, type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 })) }
      }
      if (sql.includes('FROM travel WHERE syncStatus')) return { values: pendingRows }
      if (sql.includes('FROM travel_day') || sql.includes('FROM memory') || sql.includes('FROM album') || sql.includes('FROM moment')) {
        return { values: [] }
      }
      return { values: [] }
    },
    run: async () => ({ changes: { changes: 1 } }),
    execute: async () => {},
  }
}

function item(over: Partial<SyncQueueItem> = {}): Omit<SyncQueueItem, 'id'> {
  return {
    entityType: 'TRAVEL', entityId: null, remoteId: null, operation: 'CREATE',
    payload: '{}', retryCount: 0, status: 'PENDING', lastError: null,
    createdAt: 0, updatedAt: 0, ...over,
  } as Omit<SyncQueueItem, 'id'>
}

beforeEach(() => {
  clearColumnCache()
})

describe('P1-24 · 补齐丢失的队列项', () => {
  it('PENDING_UPLOAD 行但队列里没有 → 补建一条队列项（payload 带行数据、不含本地状态列）', async () => {
    box.db = makeDb([
      { id: 'local-1', remoteId: null, title: '大理', slug: 'da-li', syncStatus: 'PENDING_UPLOAD', deleted: 0, updatedAt: 1 },
    ])
    const queue = new SyncQueue(new InMemorySyncQueueStorage())

    const created = await reconcilePendingUploads(queue)

    expect(created).toBe(1)
    const all = await queue.all()
    expect(all).toHaveLength(1)
    expect(all[0].entityType).toBe('TRAVEL')
    expect(all[0].entityId).toBe('local-1')
    const payload = JSON.parse(all[0].payload) as Record<string, unknown>
    expect(payload.title).toBe('大理')
    expect(payload.syncStatus).toBeUndefined()
    expect(all[0].operation).toBe('CREATE')
  })

  it('队列里已有该项 → 不重复补建（否则会重复上传）', async () => {
    box.db = makeDb([
      { id: 'local-1', remoteId: 55, title: '大理', slug: 'da-li', syncStatus: 'PENDING_UPLOAD', deleted: 0, updatedAt: 1 },
    ])
    const storage = new InMemorySyncQueueStorage()
    await storage.add(item({ entityId: 'local-1', remoteId: 55, operation: 'UPDATE' }))
    const queue = new SyncQueue(storage)

    const created = await reconcilePendingUploads(queue)

    expect(created).toBe(0)
    expect(await queue.all()).toHaveLength(1)
  })
})

describe('P1-24 · 回收卡死的 SYNCING', () => {
  it('超过 10 分钟的 SYNCING → 回到 PENDING（上传中被杀后能重试）', async () => {
    const storage = new InMemorySyncQueueStorage()
    const id = await storage.add(item({ status: 'SYNCING', updatedAt: Date.now() - 11 * 60_000 }))
    const queue = new SyncQueue(storage)

    const reclaimed = await reclaimStaleSyncing(queue)

    expect(reclaimed).toBe(1)
    expect((await queue.all()).find((i) => i.id === id)?.status).toBe('PENDING')
  })

  it('刚进入 SYNCING（未超时）不动它 —— 避免与正在上传的请求打架', async () => {
    const storage = new InMemorySyncQueueStorage()
    await storage.add(item({ status: 'SYNCING', updatedAt: Date.now() }))
    const queue = new SyncQueue(storage)

    expect(await reclaimStaleSyncing(queue)).toBe(0)
  })

  it('reconcileOfflineState 同时返回两项结果（供引擎日志/诊断）', async () => {
    box.db = makeDb([])
    const queue = new SyncQueue(new InMemorySyncQueueStorage())
    const result = await reconcileOfflineState(queue)
    expect(result).toEqual({ reclaimed: 0, recreated: 0 })
  })
})
