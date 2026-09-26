/**
 * 离线层 · **真实 SQLite + Android 行语义** 集成回归。
 *
 * 为什么这是目前能做的最强验证（不需要真机）：
 *   · 用 Node 24 内置的 `node:sqlite`（真 SQLite 引擎）执行**真实的 schema / SQL**，
 *     不再是假数据库 —— 可以抓出 SQL 本身写错、列不存在、PRAGMA 自愈失效这类问题；
 *   · `node:sqlite` 的 `all()` 返回**按列名索引的对象**，与 Android 插件
 *     （CapacitorSQLite.Database.selectSQL 的 `row.put(colName, v)`）**完全一致**，
 *     所以行结构语义也是真机的；
 *   · 走的是**真实初始化路径**：mock 掉插件后调用 getOfflineDb()，
 *     真实执行建表 → 列升级 → 自省自愈（healColumns）。
 *
 * 覆盖两个历史根因：
 *   1) 行结构（列名对象）—— 曾经被整行丢弃 → 本地读全空、队列全空；
 *   2) 老设备缺列（CREATE TABLE IF NOT EXISTS 不会补列）—— 曾经导致写入/读取整条失败。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

const box = vi.hoisted(() => ({ raw: null as unknown, opened: 0 }))

vi.mock('@/lib/modules/offline/platform', () => ({ isNativePlatform: () => true }))

vi.mock('@capacitor-community/sqlite', () => {
  class FakeConnection {
    private raw() {
      return box.raw as DatabaseSync
    }
    async open() {
      box.opened++
    }
    async isOpen() {
      return true
    }
    /** 插件语义：可执行多条语句 */
    async execute(sql: string) {
      this.raw().exec(sql)
      return { changes: { changes: 0 } }
    }
    /** 插件语义：返回值数组；node:sqlite 的 all() 同样是「列名对象」，与 Android 一致 */
    async query(sql: string, values: unknown[] = []) {
      const st = this.raw().prepare(sql)
      const rows = values.length > 0 ? st.all(...(values as never[])) : st.all()
      return { values: (rows as Array<Record<string, unknown>>).map(shuffleKeys) }
    }
    async run(sql: string, values: unknown[] = []) {
      const st = this.raw().prepare(sql)
      const info = values.length > 0 ? st.run(...(values as never[])) : st.run()
      return { changes: { changes: Number(info.changes), lastId: Number(info.lastInsertRowid) } }
    }
    async close() {}
  }
  class SQLiteConnection {
    async checkConnectionsConsistency() {
      return { result: false }
    }
    async isConnection() {
      return { result: false }
    }
    async createConnection() {
      return new FakeConnection()
    }
    async retrieveConnection() {
      return new FakeConnection()
    }
    async closeConnection() {}
  }
  return { SQLiteConnection, CapacitorSQLite: {} }
})

import { getOfflineDb, closeOfflineDb, clearColumnCache, toRows, rowGet } from '@/lib/modules/offline/native/sqlite-db'
import { SqliteSyncQueueStorage } from '@/lib/modules/offline/native/sqlite-sync-queue'
import { SyncQueue } from '@/lib/modules/offline/sync-queue'
import { writeLocalEntity, markEntitySynced } from '@/lib/modules/offline/local-write'
import { readLocalTravelBySlug } from '@/lib/modules/offline/travel-read'
import { applyPullEntity } from '@/lib/modules/offline/pull'

function freshRaw() {
  box.raw = new DatabaseSync(':memory:')
  return box.raw as DatabaseSync
}

/**
 * **把返回行的键序打乱**。
 *
 * 关键：Android 的 JSObject 基于 org.json，**键序没有任何保证**；
 * 若不打乱，「按位置取值（row[0]）」的错误实现会因为"恰好等于 SELECT 列序"而侥幸通过。
 * 打乱之后，只有**按列名取值**的实现才能通过 —— 这组用例才真正覆盖真机语义。
 */
function shuffleKeys(row: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(row)
  const out: Record<string, unknown> = {}
  for (const k of [...keys].reverse()) out[k] = row[k]
  return out
}

async function initOffline() {
  clearColumnCache()
  await closeOfflineDb().catch(() => {})
  return getOfflineDb()
}

beforeEach(async () => {
  box.opened = 0
  freshRaw()
})

const TRAVEL_DATA = {
  title: '大理 5 天',
  slug: 'da-li-5-tian',
  description: '环洱海',
  location: '大理',
  startDate: 1_790_000_000_000,
  endDate: 1_790_300_000_000,
  status: 'PLANNED',
  visibility: 'PRIVATE',
  travelType: 'COUPLE',
  companions: JSON.stringify([{ name: '阿元', relation: '伴侣' }]),
  isPublic: 0,
  spaceId: null,
  ownerId: null,
  cover: null,
  budget: 3000,
}

describe('真实 SQLite · 全新安装', () => {
  it('初始化建表成功，且表真实存在', async () => {
    await initOffline()
    const raw = box.raw as DatabaseSync
    const rows = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>
    const names = rows.map((r) => r.name)
    expect(names).toContain('travel')
    expect(names).toContain('travel_day')
    expect(names).toContain('memory')
    expect(names).toContain('media')
    expect(names).toContain('sync_queue')
  })

  it('写入 → 读取 → 队列 的完整闭环（Android 列名对象语义）', async () => {
    const db = await initOffline()
    const queue = new SyncQueue(new SqliteSyncQueueStorage())

    await writeLocalEntity(
      { table: 'travel', id: 'local-1', entityType: 'TRAVEL', remoteId: null, operation: 'CREATE', data: TRAVEL_DATA },
      queue,
    )

    // 读回：本地兜底能拿到 → 详情页不会报「本机也没有离线副本」
    const t = await readLocalTravelBySlug('da-li-5-tian')
    expect(t).not.toBeNull()
    expect(t!.title).toBe('大理 5 天')
    expect(t!.slug).toBe('da-li-5-tian')
    expect(t!.location).toBe('大理')
    expect(t!.budget).toBe(3000)
    expect(t!.pendingSync).toBe(true) // 还没回填 remoteId

    // 队列：能读到待上传项 → SyncEngine 才会真的上传（曾经恒为空 → 永远不上传）
    const pending = await queue.pending()
    expect(pending).toHaveLength(1)
    expect(pending[0].entityType).toBe('TRAVEL')
    expect(pending[0].entityId).toBe('local-1')

    // 回填云端 id 后 pendingSync 应转为 false（编辑按钮才会出现）
    await markEntitySynced('TRAVEL', 'local-1', 438, 'da-li-5-tian')
    const after = await readLocalTravelBySlug('da-li-5-tian')
    expect(after!.remoteId).toBe(438)
    expect(after!.pendingSync).toBe(false)

    expect(db).toBeTruthy()
  })

  it('同步队列 add/list/update/remove 全链路', async () => {
    await initOffline()
    const storage = new SqliteSyncQueueStorage()
    const id = await storage.add({
      entityType: 'MEMORY',
      entityId: 'm-1',
      remoteId: null,
      operation: 'CREATE',
      payload: '{"title":"x"}',
      retryCount: 0,
      status: 'PENDING',
      lastError: null,
      createdAt: 1,
      updatedAt: 1,
    })
    expect(id).toBeGreaterThan(0)
    let all = await storage.list()
    expect(all).toHaveLength(1)
    expect(all[0].entityType).toBe('MEMORY')

    await storage.update(id, { status: 'FAILED', retryCount: 2, lastError: 'HTTP 500', updatedAt: 2 })
    all = await storage.list()
    expect(all[0].status).toBe('FAILED')
    expect(all[0].retryCount).toBe(2)
    expect(all[0].lastError).toBe('HTTP 500')

    await storage.remove(id)
    expect(await storage.list()).toHaveLength(0)
  })
})

describe('真实 SQLite · 老设备缺列（CREATE TABLE IF NOT EXISTS 不补列）', () => {
  it('老表缺 slug/cover/budget 时：自省自愈补齐列，写入与读取都成功', async () => {
    const raw = freshRaw()
    // 模拟早年版本建出来的 travel 表：只有很少的列
    raw.exec(`
      CREATE TABLE travel (
        id TEXT PRIMARY KEY,
        title TEXT,
        syncStatus TEXT,
        updatedAt INTEGER,
        deleted INTEGER DEFAULT 0
      );
    `)

    const db = await initOffline()

    // 自愈：healColumns 应把 DESIRED_COLUMNS 里缺的列补上
    const cols = toRows(await db.query('PRAGMA table_info(travel)')).map((r) => String(rowGet(r, 'name', 1)))
    expect(cols).toContain('slug')
    expect(cols).toContain('cover')
    expect(cols).toContain('budget')

    // 写入必须成功（曾经整条 INSERT 抛错 → 新建旅行直接失败）
    const queue = new SyncQueue(new SqliteSyncQueueStorage())
    await writeLocalEntity(
      { table: 'travel', id: 'old-1', entityType: 'TRAVEL', remoteId: null, operation: 'CREATE', data: TRAVEL_DATA },
      queue,
    )

    // 读取必须拿到完整数据（曾经列漂移导致整条 SELECT 抛错 → 本地兜底为 null）
    const t = await readLocalTravelBySlug('da-li-5-tian')
    expect(t).not.toBeNull()
    expect(t!.title).toBe('大理 5 天')
    expect(t!.budget).toBe(3000)
    expect(t!.cover).toBeNull()
  })

  it('列名对象语义下 PRAGMA 也能解析（自愈依赖它）', async () => {
    const raw = freshRaw()
    raw.exec('CREATE TABLE travel (id TEXT PRIMARY KEY, title TEXT);')
    const db = await initOffline()
    const res = await db.query('PRAGMA table_info(travel)')
    // 直接看原始返回：应是「列名对象」而不是值数组（与 Android 一致）
    const first = (res as { values: unknown[] }).values[0]
    expect(Array.isArray(first)).toBe(false)
    expect(first).toHaveProperty('name')
  })
})

/**
 * 下载拉取落地（pull.ts）：每次同步都会跑，而且我刚把它的取值方式
 * 从「按位置解构」改成「按列名」（rowGet）—— 必须验证它在真 SQL + Android 行语义下成立。
 */
describe('真实 SQLite · 拉取落地（LWW 与墓碑）', () => {
  function entity(over: Partial<Record<string, unknown>> = {}) {
    return {
      table: 'travel',
      id: 'remote-uuid-1',
      remoteId: 900,
      updatedAt: 5000,
      data: { title: '云端标题', slug: 'yun-duan', location: '丽江' },
      ...over,
    } as never
  }

  it('远端新行 → 落地成功且标记 SYNCED', async () => {
    await initOffline()
    const ok = await applyPullEntity(entity())
    expect(ok).toBe(true)
    const t = await readLocalTravelBySlug('yun-duan')
    expect(t).not.toBeNull()
    expect(t!.title).toBe('云端标题')
    expect(t!.remoteId).toBe(900)
    expect(t!.pendingSync).toBe(false) // SYNCED → 不是待同步
  })

  it('本地有待上传改动（PENDING_UPLOAD）→ 跳过，不覆盖本地', async () => {
    await initOffline()
    const queue = new SyncQueue(new SqliteSyncQueueStorage())
    await writeLocalEntity(
      { table: 'travel', id: 'local-9', entityType: 'TRAVEL', remoteId: 900, operation: 'UPDATE', data: { ...TRAVEL_DATA, slug: 'ben-di', title: '本地标题' } },
      queue,
    )
    const ok = await applyPullEntity(entity({ id: 'local-9', data: { title: '云端标题', slug: 'ben-di' } }))
    expect(ok).toBe(false)
    const t = await readLocalTravelBySlug('ben-di')
    expect(t!.title).toBe('本地标题') // 本地改动被保住
  })

  it('远端更旧（updatedAt 更小）→ 跳过（LWW）', async () => {
    await initOffline()
    const queue = new SyncQueue(new SqliteSyncQueueStorage())
    await writeLocalEntity(
      { table: 'travel', id: 'local-lww', entityType: 'TRAVEL', remoteId: 901, operation: 'UPDATE', data: { ...TRAVEL_DATA, slug: 'lww', title: '较新的本地' } },
      queue,
    )
    // 先把它标成 SYNCED，否则会被 PENDING_UPLOAD 规则先拦下（那样测不到 LWW）
    await markEntitySynced('TRAVEL', 'local-lww', 901)
    const ok = await applyPullEntity(entity({ id: 'local-lww', remoteId: 901, updatedAt: 1, data: { title: '很旧的云端', slug: 'lww' } }))
    expect(ok).toBe(false)
    const t = await readLocalTravelBySlug('lww')
    expect(t!.title).toBe('较新的本地')
  })

  it('本地墓碑（deleted=1 且已同步）不被远端复活', async () => {
    const db = await initOffline()
    const queue = new SyncQueue(new SqliteSyncQueueStorage())
    // 先真实建行，再把它变成「已删除且已同步」的墓碑
    // （直接置状态的原因：走 DELETE 操作会把 syncStatus 置为 PENDING_UPLOAD，
    //   那样会被"待上传则跳过"规则先拦下，就测不到墓碑规则本身了）
    await writeLocalEntity(
      { table: 'travel', id: 'local-del', entityType: 'TRAVEL', remoteId: 902, operation: 'CREATE', data: { ...TRAVEL_DATA, slug: 'tomb', title: '已删除' } },
      queue,
    )
    await db.run("UPDATE travel SET deleted = 1, syncStatus = 'SYNCED' WHERE id = ?", ['local-del'])

    const ok = await applyPullEntity(
      entity({ id: 'local-del', remoteId: 902, updatedAt: 99999, data: { title: '想复活我', slug: 'tomb' } }),
    )
    expect(ok, '墓碑必须拒绝来自远端的复活').toBe(false)

    // 墓碑行仍留在库里（供后续对账），但不参与正常读取
    const raw = box.raw as DatabaseSync
    const row = raw.prepare('SELECT deleted, title FROM travel WHERE id = ?').get('local-del') as {
      deleted: number
      title: string
    }
    expect(Number(row.deleted)).toBe(1)
    expect(row.title).toBe('已删除')
    expect(await readLocalTravelBySlug('tomb')).toBeNull()
  })
})
