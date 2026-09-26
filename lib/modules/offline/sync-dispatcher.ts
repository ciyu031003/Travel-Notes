/**
 * 同步分发器（Stage 3.4 / C1）：把 SyncQueue 项映射为服务器写请求。
 * - 普通实体：POST/PUT/DELETE JSON；
 * - UPLOAD_MEDIA：读本地照片 base64 → multipart 上传相册媒体接口。
 */
import type { SyncQueueItem } from './types'
import { readLocalPhotoBase64 } from './media-upload'
import { findRemoteIdByLocalId } from './dao'
import { apiUrl } from '@/lib/api-base'

export interface UploadResult {
  remoteId?: number
  /** 服务器回传的规范 slug（旅行/相册等有 slug 的实体会回填到本地行） */
  slug?: string
}

export interface SyncDispatcher {
  upload(item: SyncQueueItem): Promise<UploadResult>
}

/**
 * 从写接口响应里取云端主键。
 *
 * ⚠️ 这里曾是一个**静默失效**的严重缺陷：起初只认 `{ data: { id } }` 一种形状，
 * 而项目里的写接口实际返回的是 `{ success, id, slug }`（见 `app/api/admin/travels/route.ts`）。
 * 于是 `remoteId` 永远是 undefined →
 *   · `queue.setRemoteId` 不执行、`markEntitySynced` 拿到 null；
 *   · 本地行 `remoteId` 永远为 NULL，而 `pendingSync = remoteId == null || syncStatus !== 'SYNCED'`
 *     **恒为 true**；
 *   · `TravelDetailMobile` 的 `canWrite = travelId > 0 && !pendingSync` **恒为 false**。
 * 真机表现就是：新建的旅行永远显示「还在本地待同步」，没有编辑/添加行程/删除按钮，
 * 而它其实**早就上传成功了**（队列已 markDone，不会重试）。
 * 现在两种形状都认，并顺带把 slug 带回去（服务器可能重算 slug）。
 */
function pickRemoteId(json: unknown): number | undefined {
  if (!json || typeof json !== 'object') return undefined
  const j = json as Record<string, unknown>
  const data = (j.data && typeof j.data === 'object' ? j.data : undefined) as Record<string, unknown> | undefined
  const candidates: unknown[] = [data?.id, j.id, data?.travelId, j.travelId, data?.albumId, j.albumId]
  for (const c of candidates) {
    const n = Number(c)
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}

function pickSlug(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined
  const j = json as Record<string, unknown>
  const data = (j.data && typeof j.data === 'object' ? j.data : undefined) as Record<string, unknown> | undefined
  for (const c of [data?.slug, j.slug]) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return undefined
}

// 实体类型 → 服务器写接口（3.6 后台能力模块化后逐步收敛到模块化写接口）
const ENDPOINT: Partial<Record<SyncQueueItem['entityType'], string>> = {
  MOMENT: '/api/admin/moments',
  TRAVEL: '/api/admin/travels',
  ALBUM: '/api/admin/albums',
}

/**
 * 写接口需要「父实体云端主键」时，把 payload 里的本地引用解析成远程 id。
 *
 * 离线创建的父子关系（旅行 → 天 → 回忆）在本地存的是 UUID；队列按写入顺序回放，
 * 上传到子项时父项已回填过 remoteId，所以此刻回查本地行即可。
 * 解析不到时抛错（而不是硬塞 UUID），失败项会退避重试，父项同步成功后自然通过。
 */
async function resolveRemoteId(localRef: unknown, table: string, label: string): Promise<number> {
  const raw = typeof localRef === 'number' ? localRef : Number(localRef)
  if (Number.isFinite(raw) && raw > 0) return raw
  const resolved = await findRemoteIdByLocalId(table, String(localRef ?? ''))
  if (resolved == null) throw new Error(`${label} 尚未同步到云端，稍后重试`)
  return resolved
}

/** MEMORY / TRAVEL_DAY 写接口依赖父旅行的云端 id，从 payload 取（本地引用则回查本地行） */
async function resolveEndpoint(item: SyncQueueItem): Promise<string> {
  const fixed = ENDPOINT[item.entityType]
  if (fixed) return fixed
  if (item.entityType === 'MEMORY') {
    const payload = item.payload ? JSON.parse(item.payload) : {}
    if (payload.travelId == null) throw new Error('MEMORY 缺少 travelId')
    const travelId = await resolveRemoteId(payload.travelId, 'travel', '旅行')
    return '/api/travels/' + travelId + '/memories'
  }
  if (item.entityType === 'TRAVEL_DAY') {
    const payload = item.payload ? JSON.parse(item.payload) : {}
    if (payload.travelId == null) throw new Error('TRAVEL_DAY 缺少 travelId')
    const travelId = await resolveRemoteId(payload.travelId, 'travel', '旅行')
    return '/api/travels/' + travelId + '/days'
  }
  if (item.entityType === 'LIKE' || item.entityType === 'FAVORITE' || item.entityType === 'COMMENT') {
    const payload = item.payload ? JSON.parse(item.payload) : {}
    const postId = payload.postId
    if (postId == null) throw new Error(item.entityType + ' 缺少 postId')
    const base = '/api/social/posts/' + postId
    if (item.entityType === 'LIKE') return base + '/like'
    if (item.entityType === 'FAVORITE') return base + '/favorite'
    return base + '/comments'
  }
  throw new Error('未支持的实体类型: ' + item.entityType)
}

export class HttpSyncDispatcher implements SyncDispatcher {
  async upload(item: SyncQueueItem): Promise<UploadResult> {
    if (item.operation === 'UPLOAD_MEDIA') {
      return this.uploadMedia(item)
    }
    const base = await resolveEndpoint(item)
    let url = base
    let method = 'POST'
    if (item.operation === 'DELETE') {
      if (item.remoteId == null && item.entityType !== 'LIKE' && item.entityType !== 'FAVORITE') {
        throw new Error('DELETE 缺少 remoteId')
      }
      // LIKE/FAVORITE 为幂等切换接口（POST 点赞 / DELETE 取消，同一 URL）；COMMENT 用 remoteId 定位
      if (item.entityType === 'LIKE' || item.entityType === 'FAVORITE') {
        method = 'DELETE'
      } else {
        url = base + '/' + item.remoteId
        method = 'DELETE'
      }
    } else if (item.operation === 'UPDATE') {
      if (item.remoteId == null) throw new Error('UPDATE 缺少 remoteId')
      url = base + '/' + item.remoteId
      method = 'PUT'
    }

    const hasBody = method !== 'DELETE'
    const body = hasBody ? (item.payload ? JSON.parse(item.payload) : {}) : undefined
    const res = await fetch(apiUrl(url), {
      method,
      credentials: 'include',
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const json = await res.json().catch(() => ({}))
    return { remoteId: pickRemoteId(json), slug: pickSlug(json) }
  }

  /** 媒体上传：读本地照片 → multipart → POST /api/admin/albums/{albumId}/media */
  private async uploadMedia(item: SyncQueueItem): Promise<UploadResult> {
    const payload = item.payload ? JSON.parse(item.payload) : {}
    const albumId = payload.albumId
    const localPath = payload.localPath
    const mimeType = payload.mimeType || 'image/jpeg'
    if (albumId == null) throw new Error('UPLOAD_MEDIA 缺少 albumId')
    if (!localPath) throw new Error('UPLOAD_MEDIA 缺少 localPath')

    const base64 = await readLocalPhotoBase64(localPath)
    if (!base64) throw new Error('本地照片读取失败')

    const bytes = base64ToBytes(base64)
    const form = new FormData()
    const ext = extFromMime(mimeType)
    form.append('files', new Blob([bytes], { type: mimeType }), 'photo-' + Date.now() + '.' + ext)

    const res = await fetch(apiUrl('/api/admin/albums/' + albumId + '/media'), {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const json = await res.json().catch(() => ({}))
    const media = json && typeof json === 'object' ? (json as { media?: Array<{ id?: unknown }> }).media : undefined
    const remoteId = Array.isArray(media) && media[0] && media[0].id != null ? Number(media[0].id) : undefined
    return { remoteId: Number.isFinite(remoteId as number) ? (remoteId as number) : pickRemoteId(json) }
  }
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  if (typeof atob === 'function') {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }
  return new Uint8Array(0)
}

function extFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }
  return map[mimeType] || 'jpg'
}
