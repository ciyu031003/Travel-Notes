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

/** 会话失效的判定（apiFetch 把 307→/login 与真实 401 都归一成 401） */
export function isSessionExpiredError(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 401
  if (typeof error === 'string') return error.includes('登录')
  if (error instanceof Error) return error.message.includes('登录')
  return false
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
    // redirect: 'manual' 是关键，不能省。
    // 中间件对受保护接口返回 307 → /login?redirect=…（而不是 401）。若让 fetch 跟随重定向，
    // 会拿到登录页 HTML：res.ok === true（登录页 200）、JSON.parse 失败 → json = null →
    // 既不抛错也没有数据，resolve(null)。消费方（useApi）因此得到
    // data=null / error='' / loading=false，页面条件 `loading || !profile` 恒真，
    // 表现为「一直转圈，只有登录后才显示」——真机上复现过的 bug。
    const res = await fetch(path, { credentials: 'include', signal: opts.signal, redirect: 'manual' })

    // 被重定向（同源 3xx，或跨源 opaqueredirect：type='opaqueredirect' 且 status=0）
    // 一律视为「未登录/会话失效」，交给消费方走登录引导。
    const redirected = res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)
    if (redirected) {
      throw new ApiError('登录状态已失效，请重新登录', 401)
    }

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
