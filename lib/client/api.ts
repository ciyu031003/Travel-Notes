/**
 * 轻量统一取数层（阶段 A · A2）。
 *
 * 目标（不引入第三方依赖）：
 * - 内存短缓存（按 path，可选 TTL，配合服务端 Cache-Control 减少重复请求）
 * - 并发去重（同一 path 的并发请求合并为一次网络往返）
 * - 统一错误处理（HTTP 非 2xx / 业务 error 字段 → 统一 ApiError）
 * - 兼容两种响应形态：NextResponse.json({...}) 直接对象，以及 ok() 包装的 { success, data }
 *
 * 竞态/取消由 useApi 钩子通过 AbortController 处理（见 use-api.ts）。
 */

export interface ApiFetchOptions {
  /** 浏览器内存缓存时长（毫秒）；默认 0 = 不缓存 */
  ttlMs?: number
  signal?: AbortSignal
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const memoryCache = new Map<string, { value: unknown; expireAt: number }>()
const inflight = new Map<string, Promise<unknown>>()

/** 兼容 ok() 包装：{ success: true, data } → 返回 data；其余返回原对象 */
function unwrapPayload(json: unknown): unknown {
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>
    if (obj.success === true && 'data' in obj) return obj.data
  }
  return json
}

/** 从任意 JSON 中提取业务 error 文案 */
function extractError(json: unknown): string | null {
  if (json && typeof json === 'object') {
    const err = (json as Record<string, unknown>).error
    if (typeof err === 'string' && err) return err
  }
  return null
}

export async function apiFetch<T = unknown>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const key = path

  const cached = memoryCache.get(key)
  if (cached && cached.expireAt > Date.now()) {
    return cached.value as T
  }

  // 无 signal 时并发去重（有 signal 的调用允许独立取消，不走共享 promise）
  const existing = !opts.signal ? inflight.get(key) : undefined
  if (existing) {
    return existing as Promise<T>
  }

  const p = (async () => {
    const res = await fetch(path, { credentials: 'include', signal: opts.signal })
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }

    if (!res.ok) {
      throw new ApiError(extractError(json) ?? `请求失败（${res.status}）`, res.status)
    }
    if (extractError(json)) {
      // 业务错误（200 但带 error 字段）
      throw new ApiError(extractError(json) as string, res.status || 500)
    }

    const value = unwrapPayload(json)
    if (opts.ttlMs && opts.ttlMs > 0) {
      memoryCache.set(key, { value, expireAt: Date.now() + opts.ttlMs })
    }
    return value as T
  })()

  if (!opts.signal) {
    inflight.set(key, p)
    try {
      return (await p) as T
    } finally {
      inflight.delete(key)
    }
  }
  return (await p) as T
}

/** 仅测试/调试用：清空内存缓存 */
export function __resetClientCache(): void {
  memoryCache.clear()
  inflight.clear()
}
