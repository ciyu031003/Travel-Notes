'use client'

/**
 * 客户端登录态探测的唯一入口（E1 · 首屏接口瀑布削减）
 * ============================================================================
 * E1 之前 /api/check-auth 被 3 个首屏常驻组件各调一次（DesktopChrome / Navbar /
 * DanmakuSection），而它只用于「当前用户名」这类**非首屏内容**：首页一次打开 5 个接口，
 * 其中 3 个是它。移动端 WeakNet 下这些请求和 /api/home 抢同一条带宽。
 *
 * 这里做两件事（不改变任何登录/跳转逻辑 —— 登录门禁在 middleware 与服务端，客户端只读状态）：
 *  1) **并发去重 + 60s 缓存**：多处同时问，只会发一次网络往返；
 *  2) **推迟到首帧之后**：runAfterFirstPaint / runWhenViewportMatches 让调用方把请求挪出
 *     首屏渲染路径（小屏没有展示位时干脆不请求）。
 *
 * 语义与原各处裸 fetch 一致：非 2xx / 被中间件重定向到登录页 / JSON 解析失败 → 视为未登录，
 * 不抛错（auth 探测是"尽力而为"的信息，不能因为它失败而阻塞或打断页面）。
 */
import { apiUrl } from '@/lib/api-base'
import { runAfterFirstPaint } from './persisted-cache'

export interface CheckAuthResult {
  authenticated: boolean
  username: string | null
}

/** 共享结果的新鲜期：60s 内的多处调用直接复用（原各处各自 1 次请求 → 全站最多 1 次/分钟） */
const CACHE_TTL_MS = 60_000

const UNAUTHENTICATED: CheckAuthResult = { authenticated: false, username: null }

let cached: { value: CheckAuthResult; at: number } | null = null
let inflight: Promise<CheckAuthResult> | null = null

/** 读当前缓存（给「首帧后立刻渲染已知用户名」的调用方用；没有就返回 null） */
export function peekCheckAuth(): CheckAuthResult | null {
  if (!cached) return null
  if (Date.now() - cached.at > CACHE_TTL_MS) return null
  return cached.value
}

/**
 * 探测登录态（共享 Promise + 60s 缓存）。**永不 reject** —— 失败一律归为未登录。
 *
 * @param opts.bypass 跳过缓存强制重取（例如登录成功后要立刻刷新头像/用户名）
 */
export function checkAuthShared(opts: { bypass?: boolean } = {}): Promise<CheckAuthResult> {
  if (!opts.bypass) {
    const hit = peekCheckAuth()
    if (hit) return Promise.resolve(hit)
  }
  if (inflight) return inflight
  const p = (async (): Promise<CheckAuthResult> => {
    try {
      const res = await fetch(apiUrl('/api/check-auth'), { credentials: 'include' })
      if (!res.ok) return { ...UNAUTHENTICATED }
      let data: unknown = null
      try {
        data = await res.json()
      } catch {
        // 被重定向到 /login 时拿到的是 HTML：按未登录处理（与原各处行为一致）
        return { ...UNAUTHENTICATED }
      }
      const record = (data ?? {}) as { authenticated?: unknown; username?: unknown }
      return {
        authenticated: record.authenticated === true,
        username: typeof record.username === 'string' ? record.username : null,
      }
    } catch {
      return { ...UNAUTHENTICATED }
    }
  })().then((result) => {
    // 只缓存「成功拿到响应」的结果：网络异常导致的未登录不该被缓存 60s
    cached = { value: result, at: Date.now() }
    return result
  })
  inflight = p.finally(() => {
    inflight = null
  })
  return inflight
}

/** 失效缓存（退出登录 / 登录成功后调用） */
export function invalidateCheckAuth(): void {
  cached = null
}

/** 仅测试/调试用：清空缓存与并发态 */
export function __resetCheckAuth(): void {
  cached = null
  inflight = null
}

/** matchMedia 判断（SSR / 不支持 matchMedia 时返回 false） */
export function matchesMedia(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

/**
 * 只在**视口满足断点**时执行一次（并且推迟到首帧之后）。
 *
 * 为什么需要：Navbar / DesktopChrome 在移动端也被挂载（外层用 hidden md:block / lg:flex
 * 隐藏），但它们唯一的取数就是"当前用户名"，小屏没有展示位 —— 挂载即 fetch 纯属浪费。
 * 这里在小屏直接不请求；若用户把窗口拉宽到断点，再补一次（桌面浏览器场景）。
 *
 * @returns 取消函数
 */
export function runWhenViewportMatches(query: string, cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  let disposePaint: (() => void) | null = null
  let disposeMedia: (() => void) | null = null
  let done = false

  const runOnce = () => {
    if (done) return
    done = true
    disposePaint = runAfterFirstPaint(cb)
  }

  if (matchesMedia(query)) {
    runOnce()
    return () => {
      done = true
      disposePaint?.()
    }
  }

  // 挂载时未达标：监听断点变化，变为达标后补一次（只补一次，避免反复请求）
  try {
    const mql = window.matchMedia(query)
    const onChange = () => {
      if (!mql.matches) return
      mql.removeEventListener?.('change', onChange)
      disposeMedia = null
      runOnce()
    }
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange)
      disposeMedia = () => mql.removeEventListener('change', onChange)
    }
  } catch {
    // 忽略：拿不到 media query 就保持"不请求"
  }

  return () => {
    done = true
    disposePaint?.()
    disposeMedia?.()
  }
}
