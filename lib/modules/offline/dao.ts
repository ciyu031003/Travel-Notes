/**
 * 本地 SQLite 读 DAO（Stage 3.0a）。
 * 提供离线读的通用查询助手；3.4 同步引擎会先填充本地表，页面接线时按需加实体映射。
 */
import { getOfflineDb, toRows, tableColumns } from './native/sqlite-db'
import { isNativePlatform } from './platform'

export type Row = unknown[]

/**
 * 某表真实存在的列名（原生端）。
 *
 * 用途：读取 SQL 不应硬编码列名 —— 老设备上的表可能缺少后加的列
 * （`CREATE TABLE IF NOT EXISTS` 不会补列），硬编码 `SELECT ... slug ...`
 * 会整条抛错并被静默吞掉，最终表现为「本地兜底拿不到数据 → 页面报网络错误」。
 * 调用方据此把 SELECT 收敛为「期望列 ∩ 真实列」，并对结果按下标取值。
 */
export async function tableColumnNames(table: string): Promise<string[] | null> {
  if (!isNativePlatform()) return null
  try {
    const db = await getOfflineDb()
    const cols = await tableColumns(db, table)
    return cols ? Array.from(cols) : null
  } catch {
    return null
  }
}

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

/**
 * 本地行 id → 云端主键（同步时解析依赖关系用）。
 *
 * 为什么需要：离线创建的实体之间是**本地引用**（如 `travel_day.travelId` 存的是
 * travel 行的 UUID），而上行接口要的是云端主键。队列在旅行上传成功后才处理到"天"，
 * 所以那一刻回查本地行就能拿到刚回填的 remoteId。
 * 非原生端、行不存在、或尚未回填时返回 null（调用方据此给出明确错误）。
 */
export async function findRemoteIdByLocalId(table: string, localId: string): Promise<number | null> {
  if (!isNativePlatform() || !localId) return null
  try {
    const rows = await queryRows('SELECT remoteId FROM ' + table + ' WHERE id = ? LIMIT 1', [localId])
    const value = rows[0]?.[0]
    return value == null ? null : Number(value)
  } catch {
    return null
  }
}
