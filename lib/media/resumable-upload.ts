/**
 * 图片分片上传客户端（B5）。
 *
 * 为什么图片也要分片：离线队列里的照片动辄 1–3MB（压缩后），在电梯/地铁等
 * 频繁断网的环境里，整图 multipart 一断就要从 0 重传 —— 用户看到的是
 * "照片一直在等同步"，直到放弃。分片 + 状态续传把重传成本降到 512KB 量级。
 *
 * 协议（见 app/api/media/resumable/route.ts）：
 *  init    { albumId, size, mimeType, filename } → { uploadId, chunkSize, totalChunks }
 *  status  { uploadId }                          → { exists, uploaded: number[], totalChunks }
 *  chunk   FormData { uploadId, index, chunk }   → { received: true }
 *  complete{ uploadId }                          → { success, media }
 *  abort   { uploadId }                          → 清理
 *
 * 会话持久化：按"内容 sha256 + 相册"记在 localStorage，App 被杀后再回来
 * 还能接着传（服务端临时目录 24h TTL）。失败时**保留会话**，下次继续。
 *
 * 任何失败都返回 { ok:false } 而不是抛错：调用方（媒体上传管线）会回退整图上传。
 */
import { apiUrl } from '@/lib/api-base'
import { RESUMABLE_CHUNK_BYTES, totalChunksForBytes } from './upload-policy'

const ENDPOINT = '/api/media/resumable'
const SESSION_KEY = 'tiantu-media-resumable-sessions'
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const MAX_SESSIONS = 10

export interface ResumableSession {
  uploadId: string
  albumId: number
  totalChunks: number
  size: number
  sha256: string
  createdAt: number
}

export interface ResumableUploadResult {
  ok: boolean
  media?: unknown
  error?: string
  /** 是否复用了之前的会话（续传） */
  resumed: boolean
  uploadId?: string
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  if (typeof atob !== 'function') return new Uint8Array(0)
  const bin = atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** 内容指纹：用于把"同一张图"的会话串起来（重试/杀进程后能续传） */
export async function sha256Base64(base64: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base64))
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    }
  } catch {
    // 落到下面的轻量散列
  }
  let h = 0x811c9dc5
  for (let i = 0; i < base64.length; i++) {
    h ^= base64.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return 'fnv-' + h.toString(16)
}

function readAllSessions(): Record<string, ResumableSession> {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, ResumableSession>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAllSessions(sessions: Record<string, ResumableSession>): void {
  try {
    const now = Date.now()
    const alive = Object.entries(sessions)
      .filter(([, s]) => s && now - (s.createdAt || 0) < SESSION_TTL_MS)
      .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0))
      .slice(0, MAX_SESSIONS)
    localStorage.setItem(SESSION_KEY, JSON.stringify(Object.fromEntries(alive)))
  } catch {
    // localStorage 不可用：退化为"每次重新 init"（功能仍正确，只是不能跨重启续传）
  }
}

export function getSession(sha256: string): ResumableSession | null {
  return readAllSessions()[sha256] ?? null
}

export function saveSession(sha256: string, session: ResumableSession): void {
  const all = readAllSessions()
  all[sha256] = session
  writeAllSessions(all)
}

export function removeSession(sha256: string): void {
  const all = readAllSessions()
  delete all[sha256]
  writeAllSessions(all)
}

export function resetResumableSessionsForTest(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

/** 单请求超时：分片场景下"卡住 30s 后重试"比"无限等待"体验好得多 */
const REQUEST_TIMEOUT_MS = 20_000

function requestSignal(): AbortSignal | undefined {
  const AS = typeof AbortSignal !== 'undefined'
    ? (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal })
    : undefined
  return AS && typeof AS.timeout === 'function' ? AS.timeout(REQUEST_TIMEOUT_MS) : undefined
}

async function postJson(
  body: Record<string, unknown>,
  fetchImpl: typeof fetch,
  /** B4：init/complete 带上队列项的幂等键（chunk 重传无副作用，不需要） */
  idempotencyKey?: string,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  try {
    const res = await fetchImpl(apiUrl(ENDPOINT), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
      signal: requestSignal(),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, status: res.status, json }
  } catch (e) {
    return { ok: false, status: 0, json: { error: e instanceof Error ? e.message : '网络错误' } }
  }
}

export interface ResumableUploadInput {
  albumId: number
  /** 压缩后的图片 base64（不含 data: 前缀） */
  base64: string
  mimeType?: string
  fileName?: string
  /** 队列项幂等键（payload.__clientMutationId）：complete 侧服务端按键去重防重复照片 */
  idempotencyKey?: string
  onProgress?: (percent: number) => void
  /** 测试注入用 */
  fetchImpl?: typeof fetch
}

/**
 * 执行分片上传。成功返回 media；失败返回 ok:false（调用方回退整图上传）。
 */
export async function uploadImageResumable(input: ResumableUploadInput): Promise<ResumableUploadResult> {
  const bytes = base64ToBytes(input.base64)
  if (bytes.length === 0) return { ok: false, error: '图片数据为空', resumed: false }
  const doFetch = input.fetchImpl ?? fetch
  const mimeType = input.mimeType || 'image/jpeg'
  const sha = await sha256Base64(input.base64)

  let session = getSession(sha)
  if (session && (session.albumId !== input.albumId || session.size !== bytes.length)) {
    // 同一张图换了相册/内容变了：旧会话作废（服务端 24h 后自动清理）
    removeSession(sha)
    session = null
  }
  const resumed = session != null

  if (!session) {
    const init = await postJson(
      { action: 'init', albumId: input.albumId, size: bytes.length, mimeType, filename: input.fileName || 'photo.jpg' },
      doFetch,
      input.idempotencyKey,
    )
    if (!init.ok) {
      return { ok: false, error: String(init.json.error || '初始化上传失败'), resumed: false }
    }
    const uploadId = String(init.json.uploadId || '')
    if (!uploadId) return { ok: false, error: '服务端未返回 uploadId', resumed: false }
    session = {
      uploadId,
      albumId: input.albumId,
      totalChunks: Number(init.json.totalChunks) || totalChunksForBytes(bytes.length),
      size: bytes.length,
      sha256: sha,
      createdAt: Date.now(),
    }
    saveSession(sha, session)
  }

  const current = session
  // 先问状态：续传时跳过已收到的分片（服务端返回 uploaded[]）
  const status = await postJson({ action: 'status', uploadId: current.uploadId }, doFetch)
  if (!status.ok) return { ok: false, error: String(status.json.error || '查询上传状态失败'), resumed, uploadId: current.uploadId }
  const uploaded = new Set<number>(
    Array.isArray(status.json.uploaded) ? (status.json.uploaded as unknown[]).map((n) => Number(n)) : [],
  )

  const chunkSize = Math.max(1, Math.min(RESUMABLE_CHUNK_BYTES, current.size || RESUMABLE_CHUNK_BYTES))
  const totalChunks = Math.max(1, Math.min(current.totalChunks, totalChunksForBytes(current.size, chunkSize)))

  for (let index = 0; index < totalChunks; index++) {
    if (uploaded.has(index)) continue
    const start = index * chunkSize
    const end = Math.min(current.size, start + chunkSize)
    const chunk = bytes.slice(start, end)
    try {
      const form = new FormData()
      form.append('uploadId', current.uploadId)
      form.append('index', String(index))
      form.append('chunk', new Blob([chunk], { type: mimeType }), 'chunk')
      const res = await doFetch(apiUrl(ENDPOINT), {
        method: 'POST',
        credentials: 'include',
        body: form,
        signal: requestSignal(),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
        // 保留会话：下次调用会先 status 再续传
        return { ok: false, error: String(err.error || '分片上传失败'), resumed, uploadId: current.uploadId }
      }
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : '分片上传网络错误',
        resumed,
        uploadId: current.uploadId,
      }
    }
    if (input.onProgress) {
      input.onProgress(Math.round(((index + 1) / totalChunks) * 100))
    }
  }

  const complete = await postJson({ action: 'complete', uploadId: current.uploadId }, doFetch, input.idempotencyKey)
  if (!complete.ok) {
    // 保留会话：下轮补传缺失分片后再 complete
    return { ok: false, error: String(complete.json.error || '合并上传失败'), resumed, uploadId: current.uploadId }
  }
  removeSession(sha)
  return { ok: true, media: complete.json.media, resumed, uploadId: current.uploadId }
}
