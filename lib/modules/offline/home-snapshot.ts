/**
 * 首页快照（P2-29）。
 *
 * 首页（app/page.tsx）目前只有 `useApi('/api/home')`，离线时直接进错误态 ——
 * 而离线层已经有 SQLite，完全可以把最近一次 /api/home 的响应落库当兜底。
 * 本模块只负责"存/取"，不直接改首页（首页由 C 负责接入 readHomeSnapshot）。
 *
 * 体积控制：首页快照含旅行/相册/碎碎念摘要，实测几十 KB 量级；
 * 超过 512KB 不落库（避免异常响应把本地库撑大）。
 */
import { isNativePlatform } from './platform'
import { getOfflineDb, toRows, rowGet } from './native/sqlite-db'

const SNAPSHOT_KEY = 'home'
const MAX_SNAPSHOT_BYTES = 512 * 1024

export interface HomeSnapshot<T = unknown> {
  data: T
  savedAt: number
}

export async function saveHomeSnapshot(data: unknown): Promise<boolean> {
  if (!isNativePlatform() || data == null) return false
  let json: string
  try {
    json = JSON.stringify(data)
  } catch {
    return false
  }
  if (json.length > MAX_SNAPSHOT_BYTES) return false
  try {
    const db = await getOfflineDb()
    await db.run(
      'INSERT INTO home_snapshot (key, json, updatedAt) VALUES (?, ?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET json = excluded.json, updatedAt = excluded.updatedAt',
      [SNAPSHOT_KEY, json, Date.now()],
    )
    return true
  } catch {
    // 表不存在（老库）/磁盘满：不阻断调用方
    return false
  }
}

export async function readHomeSnapshot<T = unknown>(): Promise<HomeSnapshot<T> | null> {
  if (!isNativePlatform()) return null
  try {
    const db = await getOfflineDb()
    const rows = toRows(await db.query('SELECT json, updatedAt FROM home_snapshot WHERE key = ? LIMIT 1', [SNAPSHOT_KEY]))
    if (!rows[0]) return null
    const json = rowGet(rows[0], 'json')
    if (typeof json !== 'string' || !json) return null
    return { data: JSON.parse(json) as T, savedAt: Number(rowGet(rows[0], 'updatedAt')) || 0 }
  } catch {
    return null
  }
}
