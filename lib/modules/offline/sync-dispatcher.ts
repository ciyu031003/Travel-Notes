/**
 * 同步分发器（Stage 3.4 / C1）：把 SyncQueue 项映射为服务器写请求。
 * - 普通实体：POST/PUT/DELETE JSON；
 * - UPLOAD_MEDIA：读本地照片 base64 → multipart 上传相册媒体接口。
 */
import type { SyncQueueItem } from './types'
import { readLocalPhotoBase64 } from './media-upload'
import { apiUrl } from '@/lib/api-base'

export interface UploadResult {
  remoteId?: number
}

export interface SyncDispatcher {
  upload(item: SyncQueueItem): Promise<UploadResult>
}

// 实体类型 → 服务器写接口（3.6 后台能力模块化后逐步收敛到模块化写接口）
const ENDPOINT: Partial<Record<SyncQueueItem['entityType'], string>> = {
  MOMENT: '/api/admin/moments',
  TRAVEL: '/api/admin/travels',
  ALBUM: '/api/admin/albums',
}

/** MEMORY 写接口依赖 travelId（/api/travels/{travelId}/memories），从 payload 取云端 travelId */
function resolveEndpoint(item: SyncQueueItem): string {
  const fixed = ENDPOINT[item.entityType]
  if (fixed) return fixed
  if (item.entityType === 'MEMORY') {
    const payload = item.payload ? JSON.parse(item.payload) : {}
    const travelId = payload.travelId
    if (travelId == null) throw new Error('MEMORY 缺少 travelId')
    return '/api/travels/' + travelId + '/memories'
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
    const base = resolveEndpoint(item)
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
    const data = json && typeof json === 'object' ? (json as { data?: { id?: unknown } }).data : undefined
    const remoteId = data && typeof data === 'object' && data.id != null ? Number(data.id) : undefined
    return { remoteId }
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
    return { remoteId }
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
