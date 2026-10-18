/**
 * 同步分发器（Stage 3.4 / C1）：把 SyncQueue 项映射为服务器写请求。
 * - 普通实体：POST/PUT/DELETE JSON；
 * - UPLOAD_MEDIA：读本地照片 base64 → multipart 上传相册媒体接口。
 */
import type { SyncQueueItem } from './types'
import { readLocalPhotoBase64 } from './media-upload'
import { findRemoteIdByLocalId } from './dao'
import { apiUrl } from '@/lib/api-base'
import { decodeSyncPayload } from './sync-payload'
import { CLIENT_MUTATION_ID_KEY } from './sync-queue'

/**
 * 单次同步请求超时（P1-23）。
 *
 * 为什么必须有：原先 fetch 没有任何超时，弱网/黑洞网络下单条请求可以挂几分钟，
 * 而 uploadPending 是**串行 for 循环** —— 一条卡住，后面所有用户创作都传不上去。
 */
const SYNC_TIMEOUT_MS = 20_000

/**
 * 永久失败：服务端明确拒绝（4xx 除 408/429）、或 payload 根本不可修复。
 * 命中后 SyncEngine 会把队列项标 DEAD 并停止自动重试（见 types.ts QueueStatus 注释）。
 */
export class SyncPermanentError extends Error {
  readonly permanent = true
  constructor(message: string) {
    super(message)
    this.name = 'SyncPermanentError'
  }
}

export function isPermanentSyncError(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { permanent?: unknown }).permanent === true
}

/** 超时信号；老 WebView 无 AbortSignal.timeout 时退化为无超时（保持改动前行为） */
function timeoutSignal(): AbortSignal | undefined {
  const AS = typeof AbortSignal !== 'undefined'
    ? (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal })
    : undefined
  return AS && typeof AS.timeout === 'function' ? AS.timeout(SYNC_TIMEOUT_MS) : undefined
}

async function syncFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: timeoutSignal() })
  } catch (e) {
    if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
      throw new Error('同步请求超时（' + Math.round(SYNC_TIMEOUT_MS / 1000) + 's），请检查网络后重试')
    }
    throw e
  }
}

/** 尽力从失败响应里取服务端错误原文（同步中心要能看见"为什么失败"） */
async function readErrorDetail(res: Response): Promise<string> {
  try {
    const text = await res.text()
    if (!text) return ''
    try {
      const json = JSON.parse(text) as { error?: unknown; message?: unknown }
      const v = json.error ?? json.message
      return typeof v === 'string' ? v.slice(0, 300) : ''
    } catch {
      return text.slice(0, 300)
    }
  } catch {
    return ''
  }
}

/**
 * 统一判定响应：4xx（除 408/429）→ 永久失败；408/429/5xx/网络 → 可重试。
 * 消息保留 "HTTP <status>" 前缀，历史日志与测试都按这个格式匹配。
 */
async function assertSyncOk(res: Response): Promise<void> {
  if (res.redirected) throw new Error('登录已失效，请重新登录')
  if (res.ok) return
  const detail = await readErrorDetail(res)
  const message = 'HTTP ' + res.status + (detail ? '：' + detail : '')
  const permanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429
  throw permanent ? new SyncPermanentError(message) : new Error(message)
}

/** 幂等键请求头（服务端暂不消费，先带出去；重试多轮也始终是同一个 id） */
function idempotencyHeaders(payload: Record<string, unknown>): Record<string, string> {
  const id = payload[CLIENT_MUTATION_ID_KEY]
  return typeof id === 'string' && id ? { 'Idempotency-Key': id } : {}
}

/**
 * 请求体去掉保留键。
 * 服务端写路由可能用 zod 严格 schema，多一个未知字段会被判 400 —— 保留键只用于请求头。
 */
function stripReserved(payload: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...payload }
  delete rest[CLIENT_MUTATION_ID_KEY]
  return rest
}

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
    const payload = decodeSyncPayload(item.payload)
    if (payload.travelId == null) throw new SyncPermanentError('MEMORY 缺少 travelId')
    const travelId = await resolveRemoteId(payload.travelId, 'travel', '旅行')
    return '/api/travels/' + travelId + '/memories'
  }
  if (item.entityType === 'TRAVEL_DAY') {
    const payload = decodeSyncPayload(item.payload)
    if (payload.travelId == null) throw new SyncPermanentError('TRAVEL_DAY 缺少 travelId')
    const travelId = await resolveRemoteId(payload.travelId, 'travel', '旅行')
    return '/api/travels/' + travelId + '/days'
  }
  if (item.entityType === 'LIKE' || item.entityType === 'FAVORITE' || item.entityType === 'COMMENT') {
    const payload = decodeSyncPayload(item.payload)
    const postId = payload.postId
    if (postId == null) throw new SyncPermanentError(item.entityType + ' 缺少 postId')
    const base = '/api/social/posts/' + postId
    if (item.entityType === 'LIKE') return base + '/like'
    if (item.entityType === 'FAVORITE') return base + '/favorite'
    return base + '/comments'
  }
  throw new SyncPermanentError('未支持的实体类型: ' + item.entityType)
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
    const payload = decodeSyncPayload(item.payload)
    const body = hasBody ? stripReserved(payload) : undefined
    const res = await syncFetch(apiUrl(url), {
      method,
      credentials: 'include',
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...idempotencyHeaders(payload),
      },
      body: hasBody ? JSON.stringify(body) : undefined,
    })
    await assertSyncOk(res)
    const json = await res.json()
    if (json?.success === false || json?.error) throw new Error(json.error || '同步未保存')
    return { remoteId: pickRemoteId(json), slug: pickSlug(json) }
  }

  /** 媒体上传：读本地照片 → multipart → POST /api/admin/albums/{albumId}/media */
  private async uploadMedia(item: SyncQueueItem): Promise<UploadResult> {
    const payload = decodeSyncPayload(item.payload)
    // decodeSyncPayload 返回 unknown 值（它要兼容历史双重编码），这里显式收窄
    const albumRaw = payload.albumId
    const localPathRaw = payload.localPath
    const mimeRaw = payload.mimeType
    if (albumRaw == null) throw new Error('UPLOAD_MEDIA 缺少 albumId')
    if (localPathRaw == null || localPathRaw === '') throw new Error('UPLOAD_MEDIA 缺少 localPath')
    const albumId = String(albumRaw)
    const localPath = String(localPathRaw)
    const mimeType = typeof mimeRaw === 'string' && mimeRaw ? mimeRaw : 'image/jpeg'

    const base64 = await readLocalPhotoBase64(localPath)
    if (!base64) throw new Error('本地照片读取失败')

    const bytes = base64ToBytes(base64)
    const form = new FormData()
    const ext = extFromMime(mimeType)
    form.append('files', new Blob([bytes], { type: mimeType }), 'photo-' + Date.now() + '.' + ext)

    const res = await syncFetch(apiUrl('/api/admin/albums/' + albumId + '/media'), {
      method: 'POST',
      credentials: 'include',
      // 媒体上传也要幂等键：弱网下"服务端已收、响应丢失"重传会生成重复照片
      headers: idempotencyHeaders(payload),
      body: form,
    })
    await assertSyncOk(res)
    const json = await res.json()
    if (json?.success === false || json?.error) throw new Error(json.error || '同步未保存')
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
