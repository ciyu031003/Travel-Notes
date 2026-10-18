/**
 * 本地 meta 键值（原生 SQLite）。
 *
 * 为什么需要：账号隔离（accountId）、增量拉取游标（lastSyncAt）、首页快照版本等
 * 元信息必须持久化在库里，但不能因为元数据读写失败而阻断主流程。
 * 因此这里全部是 best-effort：读失败返回 null，写失败静默（调用方按"未知"处理）。
 */
import { isNativePlatform } from './platform'
import { getOfflineDb, toRows, rowGet } from './native/sqlite-db'

export async function getMeta(key: string): Promise<string | null> {
  if (!isNativePlatform()) return null
  try {
    const db = await getOfflineDb()
    const rows = toRows(await db.query('SELECT value FROM meta WHERE key = ? LIMIT 1', [key]))
    if (!rows[0]) return null
    const v = rowGet(rows[0], 'value')
    return v == null ? null : String(v)
  } catch {
    return null
  }
}

export async function setMeta(key: string, value: string | number | null): Promise<void> {
  if (!isNativePlatform()) return
  try {
    const db = await getOfflineDb()
    await db.run(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value == null ? null : String(value)],
    )
  } catch {
    // 元数据写失败不阻断调用方（账号隔离失败时下次校验会再试）
  }
}

export async function deleteMeta(key: string): Promise<void> {
  if (!isNativePlatform()) return
  try {
    const db = await getOfflineDb()
    await db.run('DELETE FROM meta WHERE key = ?', [key])
  } catch {
    // 同上：best-effort
  }
}

/** 已识别的 meta 键（集中声明，避免各处手写字符串拼错） */
export const META_KEYS = {
  /** 当前本地库归属的账号（服务端 User.id 字符串） */
  accountId: 'accountId',
  /** 最近一次成功拉取的时间戳（增量拉取游标） */
  lastSyncAt: 'lastSyncAt',
} as const
