/**
 * 原生 SQLite 连接封装（Stage 3.2 收尾）。
 * 仅在 Capacitor 原生容器内动态 import + 初始化；Web/SSR 不会执行到 import，构建安全。
 * 注意：当前 App 仍是远程 server.url 壳，window.Capacitor 未注入，isNativePlatform() 为 false，
 * 本模块在 3.0b（本地 webDir 壳 + Capacitor 桥）落地后才真正生效。
 */
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { isNativePlatform } from '../platform'
import { CREATE_TABLES_SQL, CREATE_INDEXES_SQL } from '../schema'

const DB_NAME = 'tiantu_offline'
const DB_VERSION = 1

/** 幂等列升级（schema v2 → v3 等增量列；旧库已存在表时 CREATE IF NOT EXISTS 不会加列） */
const COLUMN_UPGRADES_SQL: string[] = [
  // v3（M1-A1）：album.travelId（相册绑定旅行）
  "ALTER TABLE album ADD COLUMN travelId INTEGER",
  // v5（同行者录入）：travel.travelType / travel.companions（多元旅行场景，兼容旧库）
  "ALTER TABLE travel ADD COLUMN travelType TEXT",
  "ALTER TABLE travel ADD COLUMN companions TEXT",
  // v6（花销预算）：travel.budget（前台花销 tab 的「预算 vs 已花」）
  "ALTER TABLE travel ADD COLUMN budget REAL",
]

/**
 * 期望列清单（表 → 列名 → 列 DDL 片段）。
 *
 * ⚠️ 为什么要有这个：上面那份手写 `ALTER` 清单**漏了列就会静默炸**。
 * 真机反馈「新建旅行后点进去报网络错误」的根因就是这一类：
 * `travel` 表若缺少 `slug`（或 `cover`）这类列，而读取 SQL 是硬编码列名，
 * `SELECT ... slug ...` 会整条抛错 → 被 `.catch(() => [])` 吞掉 → 本地兜底返回 null
 * → 详情页退化成「网络错误」。手写清单永远追不上 DDL 的演进。
 * 现在改为**自省 + 自愈**：读 `PRAGMA table_info` 拿到真实列，差集补 `ALTER TABLE ADD COLUMN`。
 */
const DESIRED_COLUMNS: Record<string, Array<[string, string]>> = {
  travel: [
    ['remoteId', 'INTEGER'], ['title', 'TEXT'], ['slug', 'TEXT'], ['description', 'TEXT'],
    ['location', 'TEXT'], ['cover', 'TEXT'], ['startDate', 'INTEGER'], ['endDate', 'INTEGER'],
    ['coverMediaId', 'INTEGER'], ['status', 'TEXT'], ['visibility', 'TEXT'], ['travelType', 'TEXT'],
    ['companions', 'TEXT'], ['isPublic', 'INTEGER'], ['budget', 'REAL'], ['spaceId', 'INTEGER'],
    ['ownerId', 'INTEGER'], ['updatedAt', 'INTEGER'], ['syncStatus', 'TEXT'], ['deleted', 'INTEGER'],
  ],
  travel_day: [
    ['remoteId', 'INTEGER'], ['travelId', 'TEXT'], ['date', 'INTEGER'], ['title', 'TEXT'],
    ['summary', 'TEXT'], ['sortOrder', 'INTEGER'], ['updatedAt', 'INTEGER'],
    ['syncStatus', 'TEXT'], ['deleted', 'INTEGER'],
  ],
  memory: [
    ['remoteId', 'INTEGER'], ['spaceId', 'INTEGER'], ['travelId', 'TEXT'], ['travelDayId', 'TEXT'],
    ['title', 'TEXT'], ['content', 'TEXT'], ['happenedAt', 'INTEGER'], ['mood', 'TEXT'],
    ['visibility', 'TEXT'], ['createdBy', 'TEXT'], ['createdById', 'INTEGER'], ['updatedAt', 'INTEGER'],
    ['syncStatus', 'TEXT'], ['deleted', 'INTEGER'],
  ],
  album: [
    ['remoteId', 'INTEGER'], ['spaceId', 'INTEGER'], ['userId', 'INTEGER'], ['title', 'TEXT'],
    ['description', 'TEXT'], ['coverMediaId', 'INTEGER'], ['date', 'INTEGER'], ['locationId', 'INTEGER'],
    ['travelId', 'INTEGER'], ['visibility', 'TEXT'], ['isPublic', 'INTEGER'], ['updatedAt', 'INTEGER'],
    ['syncStatus', 'TEXT'], ['deleted', 'INTEGER'],
  ],
  media: [
    ['remoteId', 'INTEGER'], ['spaceId', 'INTEGER'], ['memoryId', 'TEXT'], ['travelId', 'TEXT'],
    ['userId', 'INTEGER'], ['type', 'TEXT'], ['mimeType', 'TEXT'], ['size', 'INTEGER'],
    ['width', 'INTEGER'], ['height', 'INTEGER'], ['localPath', 'TEXT'], ['remoteUrl', 'TEXT'],
    ['sha256', 'TEXT'], ['takenAt', 'INTEGER'], ['visibility', 'TEXT'], ['isPublic', 'INTEGER'],
    ['updatedAt', 'INTEGER'], ['syncStatus', 'TEXT'], ['deleted', 'INTEGER'],
  ],
  moment: [
    ['remoteId', 'INTEGER'], ['content', 'TEXT'], ['tags', 'TEXT'], ['userId', 'INTEGER'],
    ['isPublic', 'INTEGER'], ['updatedAt', 'INTEGER'], ['syncStatus', 'TEXT'], ['deleted', 'INTEGER'],
  ],
}

/** 表结构自省缓存：连接期内查一次即可 */
const columnsCache = new Map<string, Set<string>>()

/** 读某表真实列名（失败返回 null，调用方按"未知"处理，绝不因此阻断主流程） */
export async function tableColumns(db: SQLiteDBConnection, table: string): Promise<Set<string> | null> {
  const cached = columnsCache.get(table)
  if (cached) return cached
  try {
    const res = await db.query(`PRAGMA table_info(${table})`)
    const rows = toRows(res)
    const cols = new Set<string>()
    for (const row of rows) {
      // PRAGMA table_info 列序：cid, name, type, notnull, dflt_value, pk
      const name = row[1]
      if (typeof name === 'string' && name) cols.add(name)
    }
    if (cols.size > 0) {
      columnsCache.set(table, cols)
      return cols
    }
    return null
  } catch {
    return null
  }
}

/** 清空结构缓存（连接重建后调用） */
export function clearColumnCache(): void {
  columnsCache.clear()
}

/** 自愈：补齐缺失列（幂等，缺列才 ALTER） */
async function healColumns(db: SQLiteDBConnection): Promise<void> {
  for (const [table, wanted] of Object.entries(DESIRED_COLUMNS)) {
    const actual = await tableColumns(db, table)
    if (!actual) continue // 表不存在或自省失败：跳过，不阻断启动
    for (const [col, type] of wanted) {
      if (actual.has(col)) continue
      try {
        await db.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`)
        actual.add(col)
      } catch {
        // 并发/重复列等：忽略
      }
    }
  }
}

let db: SQLiteDBConnection | null = null
let sqliteConn: { closeConnection: (database: string, readonly: boolean) => Promise<void> } | null = null
let initing: Promise<SQLiteDBConnection> | null = null

/** 初始化（幂等）：建连接 → open → 建表/索引 → 列升级（忽略重复列错误） */
export async function getOfflineDb(): Promise<SQLiteDBConnection> {
  if (!isNativePlatform()) {
    throw new Error('[offline] 非原生环境，不支持 SQLite')
  }
  if (db) return db
  if (!initing) {
    initing = (async () => {
      const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite')
      const sqlite = new SQLiteConnection(CapacitorSQLite)
      const conn = await sqlite.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false)
      await conn.open()
      await conn.execute(CREATE_TABLES_SQL.join(';\n') + ';')
      await conn.execute(CREATE_INDEXES_SQL.join(';\n') + ';')
      // 老清单先跑（对老库是主要路径），再跑自省自愈（补齐清单漏掉的列，如 travel.slug / travel.cover）
      for (const sql of COLUMN_UPGRADES_SQL) {
        await conn.execute(sql).catch(() => {}) // 列已存在时忽略
      }
      await healColumns(conn)
      db = conn
      sqliteConn = sqlite
      return conn
    })().catch((err) => {
      initing = null
      throw err
    })
  }
  return initing
}

/** 关闭连接（App 退出/登出时调用） */
export async function closeOfflineDb(): Promise<void> {
  if (!db || !sqliteConn) return
  try {
    await sqliteConn.closeConnection(DB_NAME, false)
  } catch {
    // 忽略关闭异常
  }
  db = null
  sqliteConn = null
  initing = null
  clearColumnCache()
}

/** 查询结果 → 行数组（每行是 any[]）；防御性剔除 iOS 可能返回的列名首行 */
export function toRows(res: { values?: unknown[] }): unknown[][] {
  const v = res?.values
  if (!Array.isArray(v)) return []
  const rows = v.filter((r): r is unknown[] => Array.isArray(r))
  if (rows.length > 0 && rows[0][0] === 'id') return rows.slice(1)
  return rows
}
