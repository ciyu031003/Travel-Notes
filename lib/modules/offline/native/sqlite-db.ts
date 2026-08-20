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

let db: SQLiteDBConnection | null = null
let sqliteConn: { closeConnection: (database: string, readonly: boolean) => Promise<void> } | null = null
let initing: Promise<SQLiteDBConnection> | null = null

/** 初始化（幂等）：建连接 → open → 建表/索引 */
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
}

/** 查询结果 → 行数组（每行是 any[]）；防御性剔除 iOS 可能返回的列名首行 */
export function toRows(res: { values?: unknown[] }): unknown[][] {
  const v = res?.values
  if (!Array.isArray(v)) return []
  const rows = v.filter((r): r is unknown[] => Array.isArray(r))
  if (rows.length > 0 && rows[0][0] === 'id') return rows.slice(1)
  return rows
}
