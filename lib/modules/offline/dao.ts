/**
 * 本地 SQLite 读 DAO（Stage 3.0a）。
 * 提供离线读的通用查询助手；3.4 同步引擎会先填充本地表，页面接线时按需加实体映射。
 */
import { getOfflineDb, toRows } from './native/sqlite-db'
import { isNativePlatform } from './platform'

export type Row = unknown[]

/** 通用查询（仅原生端可用，Web 不调用） */
export async function queryRows(sql: string, values?: unknown[]): Promise<Row[]> {
  const db = await getOfflineDb()
  return toRows(await db.query(sql, values))
}

/** 读某表全部行 */
export async function queryAll(table: string, orderBy?: string): Promise<Row[]> {
  return queryRows('SELECT * FROM ' + table + (orderBy ? ' ORDER BY ' + orderBy : ''))
}

/** 读某表单行（按 id） */
export async function queryById(table: string, id: string): Promise<Row | null> {
  const rows = await queryRows('SELECT * FROM ' + table + ' WHERE id = ? LIMIT 1', [id])
  return rows[0] ?? null
}

/** 某表是否已有本地缓存（原生端 + 表非空） */
export async function hasLocalData(table: string): Promise<boolean> {
  if (!isNativePlatform()) return false
  try {
    const db = await getOfflineDb()
    const rows = toRows(await db.query('SELECT COUNT(*) FROM ' + table))
    return rows[0] ? Number(rows[0][0]) > 0 : false
  } catch {
    return false
  }
}
