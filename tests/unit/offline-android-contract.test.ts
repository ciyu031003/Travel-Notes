/**
 * 本地层 **Android 契约** 集成回归。
 *
 * 为什么需要它（而不是只测 toRows）：
 * 根因修复（1.16.6）把「Android 返回列名对象」这件事在 toRows 里归一化了，
 * 但**真正会出错的是各个调用点** —— 只要还有一处按位置取值（`row[0]`），
 * 在那个调用点上数据就是错的，而纯函数单测完全看不到。
 * 所以这里用一个**按 Android 语义返回对象行的假数据库**，跑真正的调用链：
 *   · SqliteSyncQueueStorage.list()/add()  → 决定「用户创作能不能上传」
 *   · readLocalTravelBySlug()              → 决定「本地兜底能不能看到旅行」
 *   · findRemoteIdByLocalId()              → 决定子实体（行程天/回忆）能不能挂到云端旅行上
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Android 形状：每行是按列名索引的对象（见 CapacitorSQLite Database.selectSQL 的 row.put(colName, v)） */
function android(values: Array<Record<string, unknown>>) {
  return { values: values.map(reorderKeys) }
}

/**
 * **故意打乱键序**。
 *
 * 这一条是这组用例的关键：Android 的 JSObject 基于 org.json，**键序没有任何保证**。
 * 如果假数据恰好按 SELECT 的列顺序给出，那么"按位置取值"的错误实现也会碰巧通过 ——
 * 测试就失去了意义。把键序反过来之后，只有**按列名取值**的实现才能通过。
 */
function reorderKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(row).reverse()) out[k] = row[k]
  return out
}

const box = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@/lib/modules/offline/platform', () => ({ isNativePlatform: () => true }))
vi.mock('@/lib/modules/offline/native/sqlite-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/modules/offline/native/sqlite-db')>()
  return { ...actual, getOfflineDb: async () => box.db }
})

import { SqliteSyncQueueStorage } from '@/lib/modules/offline/native/sqlite-sync-queue'
import { SyncQueue } from '@/lib/modules/offline/sync-queue'
import { readLocalTravelBySlug } from '@/lib/modules/offline/travel-read'
import { findRemoteIdByLocalId } from '@/lib/modules/offline/dao'
import { clearColumnCache } from '@/lib/modules/offline/native/sqlite-db'

const TRAVEL_ROW = {
  id: 'local-uuid-1',
  remoteId: 438,
  title: '大理 5 天',
  slug: 'da-li-5-tian',
  spaceId: 61,
  description: '环洱海',
  location: '大理',
  startDate: Date.UTC(2026, 9, 1),
  endDate: Date.UTC(2026, 9, 5),
  travelType: 'COUPLE',
  companions: JSON.stringify([{ name: '阿元', relation: '伴侣' }]),
  syncStatus: 'SYNCED',
  budget: 3000,
  cover: 'https://cdn.example.com/cover.jpg',
}

let lastRun: { sql: string; values?: unknown[] } | null = null

function makeAndroidDb() {
  return {
    query: async (sql: string) => {
      if (sql.includes('PRAGMA table_info')) {
        // Android 上 PRAGMA 同样返回列名对象（键序交给 reorderKeys 打乱）
        return android(Object.keys(TRAVEL_ROW).map((name, cid) => ({ cid, name, type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 })))
      }
      if (sql.includes('FROM travel WHERE slug')) return android([TRAVEL_ROW])
      if (sql.includes('SELECT remoteId FROM travel')) return android([{ remoteId: 438 }])
      if (sql.includes('last_insert_rowid')) return android([{ id: 7 }])
      if (sql.includes('FROM sync_queue')) {
        return android([
          {
            id: 3,
            entityType: 'TRAVEL',
            entityId: 'local-uuid-1',
            remoteId: 438,
            operation: 'UPDATE',
            payload: JSON.stringify({ title: '大理 5 天' }),
            retryCount: 1,
            status: 'PENDING',
            lastError: null,
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_001_000,
          },
        ])
      }
      return android([])
    },
    run: async (sql: string, values?: unknown[]) => {
      lastRun = { sql, values }
      return { changes: { changes: 1 } }
    },
    execute: async () => {},
  }
}

beforeEach(() => {
  box.db = makeAndroidDb()
  lastRun = null
  clearColumnCache()
})

describe('Android 契约 · 同步队列（决定用户创作能否上传）', () => {
  it('list() 必须解析出队列项 —— 旧实现下这里恒为空，于是永远不上传', async () => {
    const queue = new SqliteSyncQueueStorage()
    const items = await queue.list()
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(3)
    expect(items[0].entityType).toBe('TRAVEL')
    expect(items[0].entityId).toBe('local-uuid-1')
    expect(items[0].remoteId).toBe(438)
    expect(items[0].operation).toBe('UPDATE')
    expect(items[0].status).toBe('PENDING')
    expect(items[0].retryCount).toBe(1)
    expect(items[0].payload).toContain('大理')
  })

  it('pending() 只返回 PENDING（引擎靠它决定这一轮传什么）', async () => {
    // pending() 在 SyncQueue 上（存储层只有 list）
    const queue = new SyncQueue(new SqliteSyncQueueStorage())
    const items = await queue.pending()
    expect(items).toHaveLength(1)
    expect(items[0].status).toBe('PENDING')
  })

  it('add() 从 last_insert_rowid() 取值（Android 下也是列名对象）', async () => {
    const queue = new SqliteSyncQueueStorage()
    const id = await queue.add({
      entityType: 'TRAVEL',
      entityId: 'x',
      remoteId: null,
      operation: 'CREATE',
      payload: '{}',
      retryCount: 0,
      status: 'PENDING',
      lastError: null,
      createdAt: 1,
      updatedAt: 1,
    })
    expect(id).toBe(7)
  })

  it('update()/remove() 把参数正确传给 SQL', async () => {
    const queue = new SqliteSyncQueueStorage()
    await queue.update(3, { status: 'SYNCING', updatedAt: 123 })
    expect(lastRun?.sql).toContain('UPDATE sync_queue SET')
    expect(lastRun?.values).toContain('SYNCING')
    await queue.remove(3)
    expect(lastRun?.sql).toContain('DELETE FROM sync_queue')
    expect(lastRun?.values).toEqual([3])
  })
})

describe('Android 契约 · 旅行本地读（决定离线兜底能否看到）', () => {
  it('readLocalTravelBySlug 必须解析出完整旅行（旧实现返回 null → 「本机也没有离线副本」）', async () => {
    const t = await readLocalTravelBySlug('da-li-5-tian')
    expect(t).not.toBeNull()
    expect(t!.title).toBe('大理 5 天')
    expect(t!.slug).toBe('da-li-5-tian')
    expect(t!.remoteId).toBe(438)
    expect(t!.spaceId).toBe(61)
    expect(t!.location).toBe('大理')
    expect(t!.budget).toBe(3000)
    expect(t!.travelType).toBe('COUPLE')
    expect(t!.cover).toBe('https://cdn.example.com/cover.jpg')
    // 已回填 remoteId 且 syncStatus=SYNCED → 不应再显示"待同步"
    expect(t!.pendingSync).toBe(false)
    expect(t!.companions).toEqual([{ name: '阿元', relation: '伴侣' }])
  })

  it('列自省（PRAGMA）在 Android 对象行下也能拿到列名', async () => {
    const t = await readLocalTravelBySlug('da-li-5-tian')
    // 能读到 slug/budget 说明「期望列 ∩ 真实列」计算正确（PRAGMA 解析成功）
    expect(t?.slug).toBe('da-li-5-tian')
    expect(t?.budget).toBe(3000)
  })
})

describe('Android 契约 · 子实体挂载', () => {
  it('findRemoteIdByLocalId 能取到云端 id（行程天/回忆靠它挂到云端旅行上）', async () => {
    expect(await findRemoteIdByLocalId('travel', 'local-uuid-1')).toBe(438)
  })
})
