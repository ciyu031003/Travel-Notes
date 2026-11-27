/**
 * 媒体本地管线（Stage 3.3 写入侧 + P4 读取侧）：
 * - sha256 去重（Web Crypto，降级 djb2 仅用于开发）
 * - 下载远端媒体 → 本地文件（Capacitor Filesystem）+ SQLite 元数据
 * - resolveMediaUrl：离线优先返回本地 URI，否则远端 URL
 * - P4（2026-11）读取侧本地优先：按 mediaId / remoteUrl **批量**解析本地文件（一次 SQL），
 *   并转成 WebView 可加载地址（convertFileSrc）。详见文件下半部分「读取侧本地优先」。
 */
import { getOfflineDb, toRows, rowGet } from './native/sqlite-db'
import { writeLocalFile, getLocalUri, listLocalFiles, ensureLocalDir } from './native/filesystem'
import { isNativePlatform } from './platform'
import { MEDIA_DIR, thumbPathFor, isThumbPath } from '@/lib/media/local-files'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function extFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
  }
  return map[mimeType] || 'bin'
}

/** SHA-256 十六进制（Web Crypto），去重依据 */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new Uint8Array(data))
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  // 降级：非加密散列，仅用于无 Web Crypto 的开发环境
  let h = 0
  for (let i = 0; i < data.length; i++) h = ((h << 5) - h + data[i]) | 0
  return 'djb2-' + Math.abs(h)
}

export interface CachedMedia {
  mediaId: number | string
  sha256: string
  localUri: string
}

/** 下载远端媒体并缓存到本地（幂等：sha256 去重，重复不重下） */
export async function cacheRemoteMedia(input: {
  mediaId: number | string
  remoteUrl: string
  mimeType?: string
}): Promise<CachedMedia | null> {
  if (!isNativePlatform()) return null
  try {
    const res = await fetch(input.remoteUrl)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    const hash = await sha256Hex(bytes)

    const db = await getOfflineDb()
    const mimeType = input.mimeType || 'image/jpeg'
    const existing = toRows(await db.query('SELECT id, localPath FROM media WHERE sha256 = ? LIMIT 1', [hash]))
    const existingPath = existing[0] ? rowGet(existing[0], 'localPath', 1) : null
    const localPath = existingPath ? String(existingPath) : 'media/' + hash + '.' + extFromMime(mimeType)

    if (!existing[0]) {
      await ensureLocalDir('media')
      await writeLocalFile(localPath, bytesToBase64(bytes))
    }
    const uri = await getLocalUri(localPath)

    await db.run(
      'INSERT INTO media (id, remoteId, localPath, remoteUrl, sha256, mimeType, size, syncStatus, updatedAt) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(id) DO UPDATE SET localPath = excluded.localPath, remoteUrl = excluded.remoteUrl, ' +
        'sha256 = excluded.sha256, mimeType = excluded.mimeType, size = excluded.size, updatedAt = excluded.updatedAt',
      [String(input.mediaId), Number(input.mediaId), localPath, input.remoteUrl, hash, mimeType, bytes.length, 'SYNCED', Date.now()],
    )
    return { mediaId: input.mediaId, sha256: hash, localUri: uri }
  } catch {
    return null
  }
}

/** 解析媒体显示 URL：离线优先本地 URI，否则远端 URL（原生端以外恒为远端 URL） */
export async function resolveMediaUrl(mediaId: number | string, remoteUrl: string): Promise<string> {
  if (!isNativePlatform()) return remoteUrl
  const paths = (await resolveLocalMediaPaths([mediaId]))[String(mediaId)]
  const localPath = pickLocalMediaPath(paths, 'original')
  if (localPath) {
    const uri = await toDisplayableLocalUri(localPath)
    if (uri) return uri
  }
  return remoteUrl
}

/** 按远端 URL 解析媒体显示 URL（无 mediaId 的场景，如相册封面/照片墙），本地命中返回本地 URI */
export async function resolveMediaUrlByRemote(remoteUrl: string): Promise<string> {
  if (!isNativePlatform() || !remoteUrl) return remoteUrl
  const paths = (await resolveLocalMediaPathsByRemote([remoteUrl]))[remoteUrl]
  const localPath = pickLocalMediaPath(paths, 'original')
  if (localPath) {
    const uri = await toDisplayableLocalUri(localPath)
    if (uri) return uri
  }
  return remoteUrl
}

/** 批量解析：输入 URL 列表，输出「远端 URL → 本地 URI」映射（一次 SQL，仅原生端生效） */
export async function resolveMediaUrlsByRemote(urls: string[]): Promise<Record<string, string>> {
  if (!isNativePlatform() || urls.length === 0) return {}
  return resolveLocalMediaUrisByRemote(urls, 'original')
}


/* ==========================================================================================
 * P4（2026-11）：读取侧「本地优先」
 *
 * 写入侧（media-upload.ts）早就在本地留了文件：原图 media/<id>.<ext> + 320px 缩略图
 * media/<id>-thumb.jpg（上传成功后删原图、localPath 改指缩略图）。
 * 但读取侧只有「按 remoteUrl 反查」且是 N+1 循环查询，于是：
 *   · 离线新建、尚未上传（remoteUrl = NULL）的照片**永远**解析不到本地文件 —— 它压根没有 URL；
 *   · 相册墙/照片墙几十张图 = 几十条 SQL。
 * 这里补上批量解析（一次 SQL 查完）+ 文件存在性校验（LRU 清理后 DB 行可能指向已删文件）
 * + WebView 可加载的地址转换（Android WebView 直接加载 file:// 会被拦，必须 convertFileSrc）。
 * ========================================================================================== */

/** 一次 SQL 里最多绑定多少个 id / URL（SQLite 变量上限 999，留余量） */
const LOCAL_MEDIA_BATCH = 200

/** 本地媒体路径解析结果（按 mediaId 聚合；缩略图与原图分开给出） */
export interface LocalMediaPaths {
  mediaId: string
  /** 本地原图路径；已上传（原图被删）或文件已被 LRU 清理时为 null */
  localPath: string | null
  /** 本地 320px 缩略图路径（media/<id>-thumb.jpg）；不存在时为 null */
  thumbPath: string | null
  /** 远端 URL；**离线新建、尚未上传的照片为 null**（这类照片只能靠本地文件显示） */
  remoteUrl: string | null
  /** 尚未上传（remoteUrl 为空）—— 读取侧必须走本地文件，否则一定白屏 */
  pendingUpload: boolean
}

/** 选择本地文件时的偏好：列表用缩略图（快），大图/预览用原图（清晰） */
export type LocalMediaPrefer = 'original' | 'thumb'

/**
 * 纯函数：按偏好挑一个本地文件。
 * viaThumb：本次挑中的是 320px 缩略图（而调用方想要原图）—— 调用方据此决定
 * 「在线时宁可走远端高清，离线时才接受这张小图」。
 */
export function pickLocalMediaFile(
  paths: LocalMediaPaths | null | undefined,
  prefer: LocalMediaPrefer = 'original',
): { path: string; viaThumb: boolean } | null {
  if (!paths) return null
  if (prefer === 'thumb') {
    if (paths.thumbPath) return { path: paths.thumbPath, viaThumb: true }
    if (paths.localPath) return { path: paths.localPath, viaThumb: false }
    return null
  }
  if (paths.localPath) return { path: paths.localPath, viaThumb: false }
  if (paths.thumbPath) return { path: paths.thumbPath, viaThumb: true }
  return null
}

/** 纯函数：按偏好挑一个本地路径（优先项不存在时回退另一项） */
export function pickLocalMediaPath(
  paths: LocalMediaPaths | null | undefined,
  prefer: LocalMediaPrefer = 'original',
): string | null {
  return pickLocalMediaFile(paths, prefer)?.path ?? null
}

/** 去重 + 归一化成字符串 id / URL（空值丢弃） */
function normalizeKeys(values: (string | number | null | undefined)[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (value == null) continue
    const key = String(value).trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

/** IN (?,?,…) 占位符 */
function sqlPlaceholders(count: number): string {
  return new Array(count).fill('?').join(',')
}

/**
 * 列出 media 目录里真实存在的文件名（**一次** readdir，用来批量校验 DB 行指向的文件还在不在）。
 * 返回 null 表示扫描失败 → 调用方按「信任 DB」处理（宁可试一次本地，也不要因为扫描失败而丢本地图）。
 */
async function existingMediaFileNames(): Promise<Set<string> | null> {
  try {
    return new Set(await listLocalFiles(MEDIA_DIR))
  } catch {
    return null
  }
}

/** 路径对应的文件是否还在（media 目录外的路径无法用清单判断，按存在处理） */
function mediaFileExists(path: string, existing: Set<string> | null): boolean {
  if (!existing) return true
  const prefix = MEDIA_DIR + '/'
  if (!path.startsWith(prefix)) return true
  return existing.has(path.slice(prefix.length))
}

/** DB 行 → LocalMediaPaths（原图/缩略图分别判定，缺失即 null） */
function buildLocalMediaPaths(
  row: ReturnType<typeof toRows>[number],
  mediaId: string,
  existing: Set<string> | null,
): LocalMediaPaths {
  const rawLocalPath = rowGet(row, 'localPath')
  const rawRemoteUrl = rowGet(row, 'remoteUrl')
  const dbPath = typeof rawLocalPath === 'string' && rawLocalPath ? rawLocalPath : null
  const remoteUrl = typeof rawRemoteUrl === 'string' && rawRemoteUrl ? rawRemoteUrl : null

  const thumbCandidate = thumbPathFor(mediaId)
  let localPath: string | null = null
  let thumbPath: string | null = null

  if (dbPath && mediaFileExists(dbPath, existing)) {
    // localPath 可能已经是缩略图（上传成功后 local-files 回写过）
    if (isThumbPath(dbPath)) thumbPath = dbPath
    else localPath = dbPath
  }
  if (!thumbPath && mediaFileExists(thumbCandidate, existing)) thumbPath = thumbCandidate

  return { mediaId, localPath, thumbPath, remoteUrl, pendingUpload: !remoteUrl }
}

/**
 * 按 mediaId 批量解析本地文件路径（**一次 SQL**，绝不 N+1）。
 * 原生端 + 有 id 才查询；Web/SSR 直接返回空映射（调用方据此保持远端 URL）。
 */
export async function resolveLocalMediaPaths(
  mediaIds: (number | string | null | undefined)[],
): Promise<Record<string, LocalMediaPaths>> {
  const out: Record<string, LocalMediaPaths> = {}
  if (!isNativePlatform()) return out
  const ids = normalizeKeys(mediaIds)
  if (ids.length === 0) return out

  let db: Awaited<ReturnType<typeof getOfflineDb>>
  try {
    db = await getOfflineDb()
  } catch {
    return out
  }
  const existing = await existingMediaFileNames()

  for (let offset = 0; offset < ids.length; offset += LOCAL_MEDIA_BATCH) {
    const chunk = ids.slice(offset, offset + LOCAL_MEDIA_BATCH)
    let rows: ReturnType<typeof toRows> = []
    try {
      rows = toRows(
        await db.query(
          'SELECT id, localPath, remoteUrl FROM media WHERE id IN (' + sqlPlaceholders(chunk.length) + ')',
          chunk,
        ),
      )
    } catch {
      continue
    }
    for (const row of rows) {
      const id = String(rowGet(row, 'id') ?? '')
      if (!id) continue
      out[id] = buildLocalMediaPaths(row, id, existing)
    }
  }
  return out
}

/**
 * 按远端 URL 批量解析本地文件路径（**一次 SQL**，返回 key = remoteUrl）。
 * 语义与旧 resolveMediaUrlsByRemote 一致，只是不再逐条循环查询。
 */
export async function resolveLocalMediaPathsByRemote(
  remoteUrls: (string | null | undefined)[],
): Promise<Record<string, LocalMediaPaths>> {
  const out: Record<string, LocalMediaPaths> = {}
  if (!isNativePlatform()) return out
  const urls = normalizeKeys(remoteUrls)
  if (urls.length === 0) return out

  let db: Awaited<ReturnType<typeof getOfflineDb>>
  try {
    db = await getOfflineDb()
  } catch {
    return out
  }
  const existing = await existingMediaFileNames()

  for (let offset = 0; offset < urls.length; offset += LOCAL_MEDIA_BATCH) {
    const chunk = urls.slice(offset, offset + LOCAL_MEDIA_BATCH)
    let rows: ReturnType<typeof toRows> = []
    try {
      rows = toRows(
        await db.query(
          'SELECT id, localPath, remoteUrl FROM media WHERE remoteUrl IN (' + sqlPlaceholders(chunk.length) + ')',
          chunk,
        ),
      )
    } catch {
      continue
    }
    for (const row of rows) {
      const id = String(rowGet(row, 'id') ?? '')
      const url = rowGet(row, 'remoteUrl')
      if (!id || typeof url !== 'string' || !url) continue
      out[url] = buildLocalMediaPaths(row, id, existing)
    }
  }
  return out
}

/**
 * media 目录基址 URI 缓存：拿到一次 .../files/media 之后，
 * 同一批文件地址可以直接拼出来，不必每个文件调用一次 Filesystem 插件。
 */
let mediaDirBaseUri: string | null = null
/** 并发去重：同一批图会同时调用它，必须共用同一次插件调用 */
let mediaDirBaseUriPromise: Promise<string> | null = null

async function getMediaDirBaseUri(): Promise<string> {
  if (mediaDirBaseUri !== null) return mediaDirBaseUri
  if (!mediaDirBaseUriPromise) {
    mediaDirBaseUriPromise = (async () => {
      try {
        const uri = await getLocalUri(MEDIA_DIR)
        return uri ? uri.replace(/\/+$/, '') : ''
      } catch {
        return ''
      }
    })().then((uri) => {
      mediaDirBaseUri = uri
      return uri
    })
  }
  return mediaDirBaseUriPromise
}

/**
 * 本地路径 → 可直接放进 <img src> 的地址。
 *
 * 为什么必须过 convertFileSrc：Capacitor 的 Android WebView **不允许**从 http(s) 页面
 * 加载 file:// 资源（插件返回的是 file:///data/.../media/x.jpg）。Capacitor 把文件
 * 映射成 http://localhost/_capacitor_file_/... 才能渲染 —— 这正是 convertFileSrc 的职责。
 * 旧代码直接返回 Filesystem.getUri 的 file:// 地址，在真机上大概率是不显示的。
 */
export async function toDisplayableLocalUri(localPath: string): Promise<string> {
  if (!localPath) return ''
  let uri = ''
  const prefix = MEDIA_DIR + '/'
  if (localPath.startsWith(prefix)) {
    const base = await getMediaDirBaseUri()
    if (base) uri = base + '/' + localPath.slice(prefix.length).replace(/^\/+/, '')
  }
  if (!uri) {
    try {
      uri = await getLocalUri(localPath)
    } catch {
      return ''
    }
  }
  if (!uri) return ''
  return convertFileSrcSafe(uri)
}

/** 交给 Capacitor 换成本地可加载地址；插件缺失/异常时退回原始 URI（与旧行为一致） */
function convertFileSrcSafe(uri: string): string {
  if (typeof window === 'undefined') return uri
  const cap = (window as unknown as { Capacitor?: { convertFileSrc?: unknown } }).Capacitor
  if (cap && typeof cap.convertFileSrc === 'function') {
    try {
      return String((cap.convertFileSrc as (value: string) => string)(uri))
    } catch {
      return uri
    }
  }
  return uri
}

/** 命中结果：本地显示地址 + 是否「降级到 320px 缩略图」 */
export interface LocalMediaUriHit {
  uri: string
  viaThumb: boolean
}

/** 批量把「本地路径命中」转成显示地址（按偏好选原图/缩略图） */
async function toDisplayableHitMap(
  pathsById: Record<string, LocalMediaPaths>,
  prefer: LocalMediaPrefer,
): Promise<Record<string, LocalMediaUriHit>> {
  const out: Record<string, LocalMediaUriHit> = {}
  const entries = Object.entries(pathsById)
  await Promise.all(
    entries.map(async ([key, paths]) => {
      const picked = pickLocalMediaFile(paths, prefer)
      if (!picked) return
      const uri = await toDisplayableLocalUri(picked.path)
      if (uri) out[key] = { uri, viaThumb: picked.viaThumb }
    }),
  )
  return out
}

/** mediaId 列表 → 本地显示地址映射（含「是否降级缩略图」；原生端以外恒为空） */
export async function resolveLocalMediaHitsByIds(
  mediaIds: (number | string | null | undefined)[],
  prefer: LocalMediaPrefer = 'original',
): Promise<Record<string, LocalMediaUriHit>> {
  return toDisplayableHitMap(await resolveLocalMediaPaths(mediaIds), prefer)
}

/** remoteUrl 列表 → 本地显示地址映射（含「是否降级缩略图」；原生端以外恒为空） */
export async function resolveLocalMediaHitsByRemote(
  remoteUrls: (string | null | undefined)[],
  prefer: LocalMediaPrefer = 'original',
): Promise<Record<string, LocalMediaUriHit>> {
  return toDisplayableHitMap(await resolveLocalMediaPathsByRemote(remoteUrls), prefer)
}

/** mediaId 列表 → 本地显示地址映射（只含命中项；原生端以外恒为空） */
export async function resolveLocalMediaUrisByIds(
  mediaIds: (number | string | null | undefined)[],
  prefer: LocalMediaPrefer = 'original',
): Promise<Record<string, string>> {
  const hits = await resolveLocalMediaHitsByIds(mediaIds, prefer)
  const out: Record<string, string> = {}
  for (const [key, hit] of Object.entries(hits)) out[key] = hit.uri
  return out
}

/** remoteUrl 列表 → 本地显示地址映射（只含命中项；原生端以外恒为空） */
export async function resolveLocalMediaUrisByRemote(
  remoteUrls: (string | null | undefined)[],
  prefer: LocalMediaPrefer = 'original',
): Promise<Record<string, string>> {
  const hits = await resolveLocalMediaHitsByRemote(remoteUrls, prefer)
  const out: Record<string, string> = {}
  for (const [key, hit] of Object.entries(hits)) out[key] = hit.uri
  return out
}

/** 测试用：清掉「media 目录基址 URI」缓存 */
export function resetLocalMediaUriCacheForTest(): void {
  mediaDirBaseUri = null
  mediaDirBaseUriPromise = null
}

/* ------------------------------ 引用归一化（供 hook / 组件共用） ------------------------------ */

/** 单张媒体的引用：mediaId / remoteUrl 至少给一个（mediaId 优先） */
export interface LocalMediaRef {
  /** 媒体主键（远端 id 或本地 uuid） */
  mediaId?: number | string | null
  /** 远端 URL（拿不到 mediaId 时按它反查本地文件） */
  remoteUrl?: string | null
}

/** 入参也接受裸值：number 视为 mediaId，string 视为 remoteUrl（兼容旧调用） */
export type LocalMediaInput = LocalMediaRef | number | string | null | undefined

/** 把入参归一化成 { mediaId, remoteUrl }；两者都空返回 null */
export function toLocalMediaRef(input: LocalMediaInput): LocalMediaRef | null {
  if (input == null) return null
  if (typeof input === 'number') return Number.isFinite(input) ? { mediaId: input } : null
  if (typeof input === 'string') {
    const url = input.trim()
    return url ? { remoteUrl: url } : null
  }
  const rawId = input.mediaId
  const mediaId = rawId == null
    ? null
    : typeof rawId === 'number'
      ? (Number.isFinite(rawId) ? rawId : null)
      : String(rawId).trim() || null
  const remoteUrl = input.remoteUrl == null ? '' : String(input.remoteUrl).trim()
  if (mediaId == null && !remoteUrl) return null
  return { mediaId, remoteUrl: remoteUrl || null }
}

/**
 * 缓存键：mediaId 优先（同一张图换了 URL 也命中），否则用 remoteUrl；
 * 原图/缩略图分开缓存（同一个 id 可能两种偏好都要）。
 */
export function localMediaCacheKey(
  ref: LocalMediaRef | null | undefined,
  prefer: LocalMediaPrefer = 'original',
): string {
  if (!ref) return ''
  const mediaId = ref.mediaId == null ? '' : String(ref.mediaId).trim()
  if (mediaId) return 'id:' + mediaId + '#' + prefer
  const remoteUrl = ref.remoteUrl == null ? '' : String(ref.remoteUrl).trim()
  return remoteUrl ? 'url:' + remoteUrl + '#' + prefer : ''
}

