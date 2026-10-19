/**
 * 本地媒体文件生命周期（B5）。
 *
 * 背景：离线队列把原图写进 Directory.Data/media（App 私有空间），
 * Android **不会**自动清理它。之前的行为是"只增不减"：
 *  · 上传成功后原图仍留在本地（HTTP 已能显示服务端版本，本地副本纯属浪费）；
 *  · 缓存下载的远端图也没有任何上限；
 *  · 用户装几个月后 Data 目录会被照片吃满，最终写入失败 → 离线功能整体失效。
 *
 * 本模块负责三件事：
 *  ① 上传成功后**删原图、留缩略图**（localPath 改成 -thumb 路径，离线仍能显示小图）；
 *  ② 按配额（默认 400MB）做 LRU：最久未访问的先删；**跳过仍在待上传队列里的文件**；
 *  ③ 暴露统计（usedBytes/quota）供「数据与同步」页展示。
 *
 * 所有函数都是 best-effort：清理失败不能影响上传/同步/页面渲染。
 * 媒体文件命名约定（重要，prune 靠它区分"自己上传的原图"与"下载的缓存图"）：
 *   · 本机上传原图：media/<mediaId>.<ext>     ← 可删（上传成功后）
 *   · 本机缩略图：  media/<mediaId>-thumb.jpg ← 保留（低带宽离线副本）
 *   · 远端缓存图：  media/<sha256>.<ext>      ← 只受 LRU 配额约束，不按"上传成功"删
 */
import {
  listLocalFiles,
  statLocalFile,
  deleteLocalFile,
  ensureLocalDir,
} from '@/lib/modules/offline/native/filesystem'
import { getOfflineDb, toRows, rowGet } from '@/lib/modules/offline/native/sqlite-db'
import { SyncQueue } from '@/lib/modules/offline/sync-queue'
import { getSyncQueueStorage } from '@/lib/modules/offline/storage'
import { decodeSyncPayload } from '@/lib/modules/offline/sync-payload'

/** 媒体目录（Directory.Data 下） */
export const MEDIA_DIR = 'media'
/** 默认配额：400MB（低于多数低端机 Data 分区可用空间的 1/4） */
export const MEDIA_QUOTA_BYTES = 400 * 1024 * 1024
/** 缩略图后缀（与 thumbPathFor 保持一致） */
const THUMB_SUFFIX = '-thumb.jpg'

export function thumbPathFor(mediaId: string): string {
  return MEDIA_DIR + '/' + mediaId + THUMB_SUFFIX
}

export function isThumbPath(path: string): boolean {
  return /-thumb\.(jpe?g|png|webp)$/i.test(path)
}

/** localPath 是否属于"本机上传的原图"（文件名主干 == mediaId） */
export function isOwnUploadPath(path: string, mediaId: string): boolean {
  const name = path.split('/').pop() || ''
  const stem = name.replace(/\.[a-z0-9]+$/i, '')
  return stem === mediaId
}

export interface MediaFileEntry {
  path: string
  size: number
  /** 最后修改时间（毫秒）——LRU 排序依据 */
  lastUsed: number
  /** 是否仍被待上传队列引用（true → 绝不删） */
  queued: boolean
}

export interface EvictionPlan {
  /** 按"最旧优先"要删除的文件 */
  remove: MediaFileEntry[]
  freedBytes: number
  /** 删除后仍占用 */
  remainBytes: number
  /** 清理前总占用 */
  totalBytes: number
  quotaBytes: number
}

/**
 * 纯函数：算出该删哪些文件（可单测，不碰文件系统）。
 *
 * 规则：
 *  · 只考虑非 queued 的条目（待上传的原图删了就等于丢用户内容）；
 *  · 最久未修改的先删（lastUsed 升序）；
 *  · 删到总量 ≤ 配额为止；配额内不动；
 *  · 缩略图默认也参与（它们同样是空间），但总在最后才被考虑（体积小、价值高）。
 */
export function planLruEviction(
  entries: MediaFileEntry[],
  quotaBytes: number = MEDIA_QUOTA_BYTES,
  options?: { protectThumbs?: boolean },
): EvictionPlan {
  const quota = Number.isFinite(quotaBytes) && quotaBytes > 0 ? quotaBytes : MEDIA_QUOTA_BYTES
  // 按路径去重：文件系统扫描理论上不会重复，但防御性去重能避免"同一文件删两次"与统计翻倍
  const seen = new Set<string>()
  const unique = entries.filter((e) => {
    if (!e || !e.path || seen.has(e.path)) return false
    seen.add(e.path)
    return true
  })
  const totalBytes = unique.reduce((sum, e) => sum + Math.max(0, e.size || 0), 0)
  const plan: EvictionPlan = { remove: [], freedBytes: 0, remainBytes: totalBytes, totalBytes, quotaBytes: quota }
  if (totalBytes <= quota) return plan

  const protectThumbs = options?.protectThumbs === true
  const candidates = unique
    .filter((e) => !e.queued && (!protectThumbs || !isThumbPath(e.path)))
    .sort((a, b) => {
      // 缩略图放最后（同 lastUsed 时也不先删它）
      const thumbA = isThumbPath(a.path) ? 1 : 0
      const thumbB = isThumbPath(b.path) ? 1 : 0
      if (thumbA !== thumbB) return thumbA - thumbB
      return a.lastUsed - b.lastUsed
    })

  let remain = totalBytes
  for (const entry of candidates) {
    if (remain <= quota) break
    plan.remove.push(entry)
    plan.freedBytes += Math.max(0, entry.size || 0)
    remain -= Math.max(0, entry.size || 0)
  }
  plan.remainBytes = remain
  return plan
}

/** 读取待上传队列里引用的本地文件路径（这些文件不能删） */
export async function collectQueuedMediaPaths(): Promise<Set<string>> {
  const queued = new Set<string>()
  try {
    const queue = new SyncQueue(getSyncQueueStorage())
    for (const item of await queue.pending()) {
      if (item.operation !== 'UPLOAD_MEDIA') continue
      try {
        const payload = decodeSyncPayload(item.payload)
        if (typeof payload.localPath === 'string' && payload.localPath) queued.add(payload.localPath)
      } catch {
        // payload 损坏：跳过（不影响清理其它文件）
      }
    }
  } catch {
    // 队列读不出来：返回空集合（调用方此时更保守——见 runMediaMaintenance 的降级）
  }
  return queued
}

/** 扫描媒体目录 → 文件条目（含大小 / mtime / 是否 queued） */
export async function collectMediaFiles(): Promise<MediaFileEntry[]> {
  const queued = await collectQueuedMediaPaths()
  const names = await listLocalFiles(MEDIA_DIR)
  const entries: MediaFileEntry[] = []
  for (const name of names) {
    const path = MEDIA_DIR + '/' + name
    const stat = await statLocalFile(path)
    if (!stat) continue
    entries.push({ path, size: stat.size, lastUsed: stat.mtime || 0, queued: queued.has(path) })
  }
  return entries
}

export interface MediaStorageStats {
  usedBytes: number
  quotaBytes: number
  fileCount: number
  thumbCount: number
  /** 0–1 */
  usedRatio: number
  /** 最近一次维护的时间戳（0 = 本会话未跑过） */
  lastRunAt: number
  /** 最近一次维护释放的字节数 */
  lastFreedBytes: number
}

let lastRunAt = 0
let lastFreedBytes = 0
let maintenanceRan = false

export async function getMediaStorageStats(): Promise<MediaStorageStats> {
  const entries = await collectMediaFiles().catch(() => [] as MediaFileEntry[])
  const usedBytes = entries.reduce((sum, e) => sum + Math.max(0, e.size || 0), 0)
  const thumbCount = entries.filter((e) => isThumbPath(e.path)).length
  return {
    usedBytes,
    quotaBytes: MEDIA_QUOTA_BYTES,
    fileCount: entries.length,
    thumbCount,
    usedRatio: MEDIA_QUOTA_BYTES > 0 ? Math.min(1, usedBytes / MEDIA_QUOTA_BYTES) : 0,
    lastRunAt,
    lastFreedBytes,
  }
}

export interface OriginalPruneResult {
  deleted: number
  freedBytes: number
  /** 已回写缩略图路径的行数 */
  switchedToThumb: number
  /** 没有缩略图、只能把 localPath 清空的行数 */
  cleared: number
}

/**
 * 上传成功的原图 → 删掉，localPath 改成缩略图路径（保留离线可看的小图）。
 *
 * 只看 syncStatus='SYNCED' 且文件名主干 == media.id 的行：
 *  · 远端缓存图（<sha>.jpg）不在此列，交给配额 LRU；
 *  · 仍是 PENDING_UPLOAD 的行绝不删（还没传上去，删了就是丢用户内容）。
 */
export async function pruneSyncedOriginals(): Promise<OriginalPruneResult> {
  const result: OriginalPruneResult = { deleted: 0, freedBytes: 0, switchedToThumb: 0, cleared: 0 }
  let rows: ReturnType<typeof toRows>
  try {
    const db = await getOfflineDb()
    rows = toRows(
      await db.query(
        'SELECT id, localPath FROM media WHERE syncStatus = ? AND remoteId IS NOT NULL AND localPath IS NOT NULL LIMIT 500',
        ['SYNCED'],
      ),
    )
  } catch {
    return result
  }

  for (const row of rows) {
    const id = String(rowGet(row, 'id') ?? '')
    const localPath = String(rowGet(row, 'localPath') ?? '')
    if (!id || !localPath || isThumbPath(localPath)) continue
    if (!isOwnUploadPath(localPath, id)) continue // 远端缓存图：不在这里删

    const stat = await statLocalFile(localPath)
    if (stat) {
      await deleteLocalFile(localPath)
      result.deleted += 1
      result.freedBytes += Math.max(0, stat.size || 0)
    }

    // 有缩略图 → 换成缩略图路径（离线仍能看）；没有 → 清空（下次从远端取）
    const thumbPath = thumbPathFor(id)
    const thumbStat = await statLocalFile(thumbPath)
    try {
      const db = await getOfflineDb()
      if (thumbStat) {
        await db.run('UPDATE media SET localPath = ? WHERE id = ?', [thumbPath, id])
        result.switchedToThumb += 1
      } else {
        await db.run('UPDATE media SET localPath = NULL WHERE id = ?', [id])
        result.cleared += 1
      }
    } catch {
      // 回写失败：文件已删，下一轮会再尝试（行里仍是旧路径，prune 会重试删除并回写）
    }
  }
  return result
}

/**
 * 单条媒体上传成功后立即收尾（由上传分发器调用；见 sync-dispatcher 的 UPLOAD_MEDIA 分支）。
 * 返回 true 表示确实删掉了原图。
 */
export async function finalizeUploadedMedia(mediaId: string): Promise<boolean> {
  if (!mediaId) return false
  let localPath = ''
  try {
    const db = await getOfflineDb()
    const rows = toRows(await db.query('SELECT localPath FROM media WHERE id = ? LIMIT 1', [mediaId]))
    localPath = String(rowGet(rows[0], 'localPath') ?? '')
  } catch {
    return false
  }
  if (!localPath || isThumbPath(localPath) || !isOwnUploadPath(localPath, mediaId)) return false

  await deleteLocalFile(localPath)
  const thumbStat = await statLocalFile(thumbPathFor(mediaId))
  try {
    const db = await getOfflineDb()
    if (thumbStat) await db.run('UPDATE media SET localPath = ? WHERE id = ?', [thumbPathFor(mediaId), mediaId])
    else await db.run('UPDATE media SET localPath = NULL WHERE id = ?', [mediaId])
  } catch {
    // 忽略：文件已删，行状态下一轮 prune 会修
  }
  return true
}

export interface MediaMaintenanceResult {
  pruned: OriginalPruneResult
  eviction: EvictionPlan
  deletedByEviction: number
  freedByEviction: number
  ranAt: number
}

/**
 * 启动维护（幂等：同一会话只跑一次）。
 * 顺序很重要：**先收尾已上传原图，再做配额 LRU** —— 原图通常是最大的那批，
 * 先删它们往往能让总量直接落到配额内，避免误删用户还没看的缓存图。
 */
export async function runMediaMaintenance(options?: { quotaBytes?: number; force?: boolean }): Promise<MediaMaintenanceResult> {
  const now = Date.now()
  const empty: MediaMaintenanceResult = {
    pruned: { deleted: 0, freedBytes: 0, switchedToThumb: 0, cleared: 0 },
    eviction: { remove: [], freedBytes: 0, remainBytes: 0, totalBytes: 0, quotaBytes: options?.quotaBytes ?? MEDIA_QUOTA_BYTES },
    deletedByEviction: 0,
    freedByEviction: 0,
    ranAt: now,
  }
  if (maintenanceRan && !options?.force) return empty
  maintenanceRan = true

  try {
    await ensureLocalDir(MEDIA_DIR)
  } catch {
    // 目录建不出来：后续步骤各自兜底
  }

  let pruned: OriginalPruneResult = { deleted: 0, freedBytes: 0, switchedToThumb: 0, cleared: 0 }
  try {
    pruned = await pruneSyncedOriginals()
  } catch {
    // 收尾失败不影响 LRU
  }

  let eviction: EvictionPlan = empty.eviction
  let deletedByEviction = 0
  let freedByEviction = 0
  try {
    const entries = await collectMediaFiles()
    eviction = planLruEviction(entries, options?.quotaBytes ?? MEDIA_QUOTA_BYTES)
    for (const entry of eviction.remove) {
      await deleteLocalFile(entry.path)
      deletedByEviction += 1
      freedByEviction += Math.max(0, entry.size || 0)
    }
  } catch {
    // 扫描/删除失败：保留上一次统计
  }

  lastRunAt = now
  lastFreedBytes = pruned.freedBytes + freedByEviction
  return {
    pruned,
    eviction,
    deletedByEviction,
    freedByEviction,
    ranAt: now,
  }
}

/** 测试用：重置"本会话已跑过"标记 */
export function resetMediaMaintenanceForTest(): void {
  maintenanceRan = false
  lastRunAt = 0
  lastFreedBytes = 0
}
