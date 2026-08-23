/**
 * 同步分发器（Stage 3.4）：把 SyncQueue 项映射为服务器写请求。
 * 说明：媒体上传（UPLOAD_MEDIA）走媒体管线 multipart，不由通用分发器处理。
 */
import type { SyncQueueItem } from './types'

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
  throw new Error('未支持的实体类型: ' + item.entityType)
}

export class HttpSyncDispatcher implements SyncDispatcher {
  async upload(item: SyncQueueItem): Promise<UploadResult> {
    const base = resolveEndpoint(item)
    if (item.operation === 'UPLOAD_MEDIA') throw new Error('媒体上传走媒体管线，不由通用分发器处理')

    let url = base
    let method = 'POST'
    if (item.operation === 'DELETE') {
      if (item.remoteId == null) throw new Error('DELETE 缺少 remoteId')
      url = base + '/' + item.remoteId
      method = 'DELETE'
    } else if (item.operation === 'UPDATE') {
      if (item.remoteId == null) throw new Error('UPDATE 缺少 remoteId')
      url = base + '/' + item.remoteId
      method = 'PUT'
    }

    const hasBody = method !== 'DELETE'
    const body = hasBody ? (item.payload ? JSON.parse(item.payload) : {}) : undefined
    const res = await fetch(url, {
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
}
