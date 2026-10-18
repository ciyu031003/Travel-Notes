/**
 * 离线数据清理（登出 / 换账号 / 账号不一致时使用）。
 *
 * 背景（M-1）：本地 SQLite 是**全局单库**，浏览器侧靠 Cookie 分离会话，
 * 而 App 里没有"每个账号一个库"这回事 —— 换账号后上一个账号的旅行/照片
 * 会从本地兜底读出来（`localOnly` 分支），待同步项还会带新账号 Cookie 上传。
 * 所以清理必须是"清表 + 删媒体文件 + 关连接 + 重置队列单例"一整套，
 * 少一步都会留下可被下个账号读到的残留。
 *
 * 所有步骤都 best-effort：登出流程不能被本地存储异常卡住。
 */
import { isNativePlatform } from './platform'
import { getOfflineDb, closeOfflineDb } from './native/sqlite-db'
import { listLocalFiles, deleteLocalFile } from './native/filesystem'
import { resetSyncQueueStorage } from './storage'

/**
 * 需要清空的本地表（与 schema.ts 的建表清单保持一一对应）。
 * 新增本地表时必须同步加到这里，否则换账号会残留该表数据。
 */
export const OFFLINE_DATA_TABLES = [
  'travel',
  'travel_day',
  'memory',
  'media',
  'album',
  'album_media',
  'memory_media',
  'moment',
  'social_post',
  'sync_queue',
  'home_snapshot',
  'meta',
] as const

export interface ClearOfflineResult {
  clearedTables: string[]
  failed: Array<{ table: string; error: string }>
}

/** 清空所有本地业务数据（含队列与 meta）。media 文件由 purge 负责删除。 */
export async function clearOfflineData(): Promise<ClearOfflineResult> {
  const result: ClearOfflineResult = { clearedTables: [], failed: [] }
  if (!isNativePlatform()) return result

  let db: Awaited<ReturnType<typeof getOfflineDb>>
  try {
    db = await getOfflineDb()
  } catch (e) {
    result.failed.push({ table: '*', error: e instanceof Error ? e.message : String(e) })
    return result
  }

  for (const table of OFFLINE_DATA_TABLES) {
    try {
      await db.run('DELETE FROM ' + table)
      result.clearedTables.push(table)
    } catch (e) {
      // 老库可能没有后加的表（如 home_snapshot）：跳过，不阻断其余清理
      result.failed.push({ table, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return result
}

/** 删除本地媒体文件（Directory.Data/media/**），返回删除个数 */
export async function clearLocalMediaFiles(): Promise<number> {
  if (!isNativePlatform()) return 0
  let deleted = 0
  try {
    const names = await listLocalFiles('media')
    for (const name of names) {
      await deleteLocalFile('media/' + name)
      deleted += 1
    }
  } catch {
    // 目录不存在 / 插件异常：视为没有文件
  }
  return deleted
}

/**
 * 登出专用：清库 → 删媒体 → 关连接 → 重置队列单例。
 * **不要**在这里 stopSyncEngine（bootstrap 会反向依赖本模块，形成循环），
 * 由调用方（app/me/settings）先停引擎再调本函数。
 */
export async function purgeOfflineForLogout(): Promise<{ mediaFiles: number; cleared: ClearOfflineResult }> {
  const cleared = await clearOfflineData()
  const mediaFiles = await clearLocalMediaFiles()
  try {
    await closeOfflineDb()
  } catch {
    // 关闭失败也要继续重置单例，否则下次 getOfflineDb 会复用半死连接
  }
  resetSyncQueueStorage()
  return { mediaFiles, cleared }
}
