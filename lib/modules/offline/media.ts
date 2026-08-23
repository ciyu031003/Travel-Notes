/**
 * 媒体本地管线（Stage 3.3）：
 * - sha256 去重（Web Crypto，降级 djb2 仅用于开发）
 * - 下载远端媒体 → 本地文件（Capacitor Filesystem）+ SQLite 元数据
 * - resolveMediaUrl：离线优先返回本地 URI，否则远端 URL
 */
import { getOfflineDb, toRows } from './native/sqlite-db'
import { writeLocalFile, getLocalUri, ensureLocalDir } from './native/filesystem'
import { isNativePlatform } from './platform'

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
    const localPath = existing[0] ? String(existing[0][1]) : 'media/' + hash + '.' + extFromMime(mimeType)

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

/** 解析媒体显示 URL：离线优先本地 URI，否则远端 URL */
export async function resolveMediaUrl(mediaId: number | string, remoteUrl: string): Promise<string> {
  if (!isNativePlatform()) return remoteUrl
  try {
    const db = await getOfflineDb()
    const rows = toRows(await db.query('SELECT localPath FROM media WHERE id = ? LIMIT 1', [String(mediaId)]))
    if (rows[0] && rows[0][0]) return await getLocalUri(String(rows[0][0]))
  } catch {
    // 本地无缓存则回退远端
  }
  return remoteUrl
}

/** 按远端 URL 解析媒体显示 URL（无 mediaId 的场景，如相册封面/照片墙），本地命中返回本地 URI */
export async function resolveMediaUrlByRemote(remoteUrl: string): Promise<string> {
  if (!isNativePlatform() || !remoteUrl) return remoteUrl
  try {
    const db = await getOfflineDb()
    const rows = toRows(await db.query('SELECT localPath FROM media WHERE remoteUrl = ? LIMIT 1', [remoteUrl]))
    if (rows[0] && rows[0][0]) return await getLocalUri(String(rows[0][0]))
  } catch {
    // 本地无缓存则回退远端
  }
  return remoteUrl
}

/** 批量解析：输入 URL 列表，输出本地 URI / 远端 URL 映射（幂等，仅原生端生效） */
export async function resolveMediaUrlsByRemote(urls: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!isNativePlatform() || urls.length === 0) return out
  try {
    const db = await getOfflineDb()
    for (const url of urls) {
      const rows = toRows(await db.query('SELECT localPath FROM media WHERE remoteUrl = ? LIMIT 1', [url]))
      if (rows[0] && rows[0][0]) out[url] = await getLocalUri(String(rows[0][0]))
    }
  } catch {
    // 忽略
  }
  return out
}
