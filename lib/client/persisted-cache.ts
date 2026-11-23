import { useEffect, useLayoutEffect } from 'react'

/**
 * 客户端持久化快照（E1 · 本地优先水合 / local-first hydration）
 * ============================================================================
 * 为什么要有这一层：lib/client/use-api.ts 与 hooks/use-travel-list.ts 的内存快照
 * 只在「本次进程」内有效 —— 冷/热启动（WebView 重开、进程被杀后恢复、刷新）后全部丢失，
 * 首屏只能等 /api/home、/api/travels 这类接口回来才出内容。移动静态壳（MOBILE_EXPORT）
 * 没有服务端直出，于是「打开 App 先看 5 秒骨架屏」。
 *
 * 本模块把「最近一次成功的响应」落进 localStorage，供首帧/水合后**同步**读取：
 *  · useApi / useTravelList / useAlbumData / HomePageClient / TravelBook 在挂载时先同步
 *    读快照 → 有数据就直接渲染 → 随后在后台静默 revalidate（stale-while-revalidate）；
 *  · 只做「读写 + 容量治理」，不关心业务形状，调用方自己决定 key 与新鲜期。
 *
 * 三条硬约束（踩过坑的地方）：
 * 1) **只在浏览器里读写**。服务端渲染阶段 localStorage 不存在，所有入口都先判
 *    「typeof window」；调用方还必须把读取放进 layout effect 之类的水合后时机，
 *    不能进 useState 初始化器 —— 否则首帧结构与服务端 HTML 不一致（hydration mismatch）。
 * 2) **key 带 schema 版本**。数据结构改动时把 SCHEMA_VERSION +1，旧 key 直接不再命中
 *    （同时也被 prune 清掉），不需要写迁移代码。
 * 3) **一切异常都静默降级**。localStorage 在隐私模式/配额满/被禁用时会抛
 *    SecurityError / QuotaExceededError；读失败当未命中，写失败自动清理后重试一次，
 *    再失败就放弃 —— 缓存是加速手段，绝不能让页面因为缓存坏了而白屏。
 *
 * 容量策略：
 *  · 单条上限 PERSISTED_MAX_ENTRY_BYTES（默认 256K 字符，≈512KB UTF-16）：超过就不落盘，
 *    避免一次异常巨大的响应（例如相册把全部图片数组塞进来）把配额吃干；
 *  · 总预算 TOTAL_BUDGET（≈3M 字符）：超预算时按 at 从旧到新淘汰本命名空间的条目，
 *    不动站内其它 key；
 *  · 配额异常时先删「过期 → 本命名空间最旧」的条目再重试一次。
 */

/** 数据结构版本：改变快照形状/语义时 +1，旧快照自然失效（无需迁移代码） */
const SCHEMA_VERSION = 1
const KEY_PREFIX = `tn:pc:v${SCHEMA_VERSION}:`

/** 默认新鲜期：24h。超过就不再当作「可水合的本地数据」 */
export const PERSISTED_TTL_MS = 24 * 60 * 60 * 1000
/** 单条快照上限（按 JSON 字符数近似，localStorage 配额以 UTF-16 码元计） */
export const PERSISTED_MAX_ENTRY_BYTES = 256 * 1024
/** 本命名空间的总预算（字符数近似） */
const TOTAL_BUDGET = 3 * 1024 * 1024
/** 淘汰后希望回落到预算的多少（留出本次写入的空间） */
const BUDGET_TARGET_RATIO = 0.6

interface Envelope {
  /** schema 版本（冗余写在 value 里，方便人工排查） */
  v: number
  /** 落盘时间戳（ms）。新鲜期/TTL 与淘汰顺序都靠它 */
  at: number
  /** 真正的数据 */
  d: unknown
}

export interface PersistedEntry<T> {
  value: T
  /** 落盘时间（ms），调用方可用它决定「要不要后台校准」 */
  at: number
}

export interface ReadPersistedOptions {
  /** 新鲜期（ms，默认 PERSISTED_TTL_MS；<=0 表示不看时间） */
  ttlMs?: number
}

export interface WritePersistedOptions {
  /** 单条上限（字符数近似，默认 PERSISTED_MAX_ENTRY_BYTES） */
  maxBytes?: number
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

/**
 * 取 localStorage。Safari 无痕模式/沙箱 iframe 下**访问 window.localStorage 本身**就会抛
 * SecurityError（不是读写时才抛），因此必须包起来。
 */
function getStorage(): Storage | null {
  if (!isBrowser()) return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** 条目是否属于本模块（含旧版本命名空间，便于清理） */
function isOurKey(key: string): boolean {
  return key.startsWith('tn:pc:')
}

function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const err = e as { name?: unknown; code?: unknown }
  if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true
  return err.code === 22 || err.code === 1014
}

function safeRemove(ls: Storage, fullKey: string): void {
  try {
    ls.removeItem(fullKey)
  } catch {
    // 忽略：删不掉也不影响读路径
  }
}

/** 列出本命名空间内所有条目（读失败返回空数组） */
function listOwnEntries(ls: Storage): { key: string; at: number; size: number; current: boolean }[] {
  const out: { key: string; at: number; size: number; current: boolean }[] = []
  let length = 0
  try {
    length = ls.length
  } catch {
    return out
  }
  for (let i = 0; i < length; i++) {
    let key: string | null = null
    try {
      key = ls.key(i)
    } catch {
      continue
    }
    if (!key || !isOurKey(key)) continue
    let raw: string | null = null
    try {
      raw = ls.getItem(key)
    } catch {
      continue
    }
    if (raw == null) continue
    let at = 0
    try {
      const env = JSON.parse(raw) as Partial<Envelope>
      if (typeof env?.at === 'number') at = env.at
    } catch {
      at = 0 // 坏数据：当作最旧，优先淘汰
    }
    out.push({ key, at, size: raw.length, current: key.startsWith(KEY_PREFIX) })
  }
  return out
}

/**
 * 清理：① 非当前 schema 版本的旧命名空间；② 超过 TTL 的条目；③ 总量超预算时按 at 最旧优先淘汰。
 * 触发时机由本模块内部掌握（写入配额不足时）——不在启动路径上做全量扫描，避免拖慢首帧。
 */
export function prunePersistedCache(opts: { ttlMs?: number; keepKeys?: readonly string[] } = {}): void {
  const ls = getStorage()
  if (!ls) return
  const ttlMs = opts.ttlMs ?? PERSISTED_TTL_MS
  const keep = opts.keepKeys ? new Set(opts.keepKeys) : null
  const now = Date.now()
  const entries = listOwnEntries(ls)
  let total = 0
  const alive: { key: string; at: number; size: number }[] = []
  for (const entry of entries) {
    const expired = ttlMs > 0 && entry.at > 0 && now - entry.at > ttlMs
    if (!entry.current || expired) {
      safeRemove(ls, entry.key)
      continue
    }
    total += entry.size
    alive.push(entry)
  }
  if (total <= TOTAL_BUDGET) return
  const target = Math.floor(TOTAL_BUDGET * BUDGET_TARGET_RATIO)
  const survivors = alive.filter((entry) => !keep?.has(entry.key)).sort((a, b) => a.at - b.at)
  for (const entry of survivors) {
    if (total <= target) break
    safeRemove(ls, entry.key)
    total -= entry.size
  }
}

/**
 * 同步读快照。命中返回 `{ value, at }`，未命中/过期/解析失败一律返回 null（**不抛**）。
 *
 * 这条路径在「水合后第一次 layout effect」里同步执行，必须足够快：
 * 一次 getItem + 一次 JSON.parse，单条上限 256K 字符（实测首页快照 ≈5–50KB 量级）。
 */
export function readPersistedCache<T = unknown>(key: string, opts: ReadPersistedOptions = {}): PersistedEntry<T> | null {
  const ls = getStorage()
  if (!ls) return null
  const fullKey = KEY_PREFIX + key
  let raw: string | null = null
  try {
    raw = ls.getItem(fullKey)
  } catch {
    return null
  }
  if (!raw) return null

  let env: Partial<Envelope> | null = null
  try {
    env = JSON.parse(raw) as Partial<Envelope>
  } catch {
    safeRemove(ls, fullKey)
    return null
  }
  if (!env || env.v !== SCHEMA_VERSION || typeof env.at !== 'number' || !('d' in env)) {
    safeRemove(ls, fullKey)
    return null
  }
  const ttlMs = opts.ttlMs ?? PERSISTED_TTL_MS
  if (ttlMs > 0 && Date.now() - env.at > ttlMs) {
    safeRemove(ls, fullKey)
    return null
  }
  return { value: env.d as T, at: env.at }
}

/**
 * 同步写快照。返回是否落盘成功（调用方一般不需要关心）。
 *
 * 超额/配额不足时的降级顺序：单条过大 → 直接跳过；配额不足 → 清理后重试一次 → 仍失败则放弃。
 */
export function writePersistedCache(key: string, value: unknown, opts: WritePersistedOptions = {}): boolean {
  const ls = getStorage()
  if (!ls) return false
  if (value === undefined) return false
  const maxBytes = opts.maxBytes ?? PERSISTED_MAX_ENTRY_BYTES

  let raw: string
  try {
    raw = JSON.stringify({ v: SCHEMA_VERSION, at: Date.now(), d: value } as Envelope)
  } catch {
    // 循环引用 / BigInt 等：不落盘
    return false
  }
  // 单条过大：不落盘，也不删旧快照（旧快照仍有 TTL，由后台刷新自然收敛）
  if (raw.length > maxBytes) return false

  const fullKey = KEY_PREFIX + key
  try {
    ls.setItem(fullKey, raw)
    return true
  } catch (e) {
    if (!isQuotaError(e)) return false
  }

  // 配额不足：① 先清过期与旧版本；② 再按最旧优先腾空间；③ 重试一次
  try {
    prunePersistedCache({ keepKeys: [fullKey] })
    const entries = listOwnEntries(ls)
      .filter((entry) => entry.current && entry.key !== fullKey)
      .sort((a, b) => a.at - b.at)
    let total = entries.reduce((sum, entry) => sum + entry.size, 0)
    const target = Math.max(0, TOTAL_BUDGET * BUDGET_TARGET_RATIO - raw.length)
    for (const entry of entries) {
      if (total <= target) break
      safeRemove(ls, entry.key)
      total -= entry.size
    }
    ls.setItem(fullKey, raw)
    return true
  } catch {
    return false
  }
}

let pendingWrites = new Map<string, { value: unknown; opts?: WritePersistedOptions }>()
let flushScheduled = false
let listening = false

function flushPendingWrites(): void {
  flushScheduled = false
  if (pendingWrites.size === 0) return
  const tasks = pendingWrites
  pendingWrites = new Map()
  // 用 forEach 而不是 for...of：项目 tsconfig 的 target 低于 ES2015，Map 不能直接迭代
  tasks.forEach((task, key) => writePersistedCache(key, task.value, task.opts))
}

/**
 * 页面被隐藏/卸载时把队列里还没写的快照同步落盘（否则「拿到数据就切后台」会白跑一次）。
 * 只在第一次真正有排队写入时注册监听。
 */
function ensureLifecycleListener(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  const flushNow = () => flushPendingWrites()
  window.addEventListener('pagehide', flushNow)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow()
  })
}

/**
 * 延迟落盘（推荐给请求成功后的回调使用）。
 *
 * 为什么不在 then 里直接写：JSON.stringify + setItem 是同步的，几百 KB 时在低端机上
 * 能占十几毫秒 —— 放在数据刚到、正要渲染的那一帧里就是一次可感知的卡顿。
 * 这里推到「下一帧之后」，让内容先上屏，再用空闲时段把快照写掉。
 */
export function persistSoon(key: string, value: unknown, opts?: WritePersistedOptions): void {
  if (!isBrowser()) return
  pendingWrites.set(key, { value, opts })
  ensureLifecycleListener()
  if (flushScheduled) return
  flushScheduled = true
  const run = () => {
    window.setTimeout(flushPendingWrites, 0)
  }
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run)
  else run()
}

/** 删除单条快照（写操作成功后失效对应数据） */
export function dropPersistedCache(key: string): void {
  pendingWrites.delete(key)
  const ls = getStorage()
  if (!ls) return
  safeRemove(ls, KEY_PREFIX + key)
}

/** 清空本模块的全部快照（退出登录、会话失效时调用；旧版本命名空间一并清掉） */
export function clearPersistedCache(): void {
  pendingWrites.clear()
  flushScheduled = false
  const ls = getStorage()
  if (!ls) return
  for (const entry of listOwnEntries(ls)) safeRemove(ls, entry.key)
}

/** 诊断用：当前命名空间内的快照 key（不含前缀）、落盘时间与估算体积 */
export function inspectPersistedCache(): { key: string; at: number; bytes: number }[] {
  const ls = getStorage()
  if (!ls) return []
  return listOwnEntries(ls)
    .filter((entry) => entry.current)
    .map((entry) => ({ key: entry.key.slice(KEY_PREFIX.length), at: entry.at, bytes: entry.size }))
}

/**
 * 水合后才执行的 layout effect：服务端渲染阶段用 useEffect 顶替（useLayoutEffect 在 SSR 会告警）。
 *
 * 调用方用它来「水合提交后、浏览器绘制前」同步读快照 —— 这样即使首屏 HTML 只有骨架，
 * 用户也看不到「骨架 → 水合 → 再闪一下骨架 → 内容」的过程。
 * 注意：**读取只能在 effect 里做**，不能进 useState 初始化器，否则首帧结构与服务端 HTML
 * 不一致（hydration mismatch）。
 */
export const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * 「首帧之后」调度：先让浏览器把当前帧画出来，再执行业务回调（默认再叠加一次空闲调度）。
 *
 * 用途：把**不参与首屏内容**的请求（弹幕、登录态探测、通知未读数……）挪出关键渲染路径。
 * 打开 App 时网络只有一条：这些请求和 /api/home 抢带宽，首屏就会被拖慢。
 *
 * 调度顺序：requestAnimationFrame（当前帧画完）→ requestIdleCallback（空闲，最长等 timeoutMs）
 *           → 退化 setTimeout（Safari/WKWebView 无 rIC 时）。
 * 返回取消函数（组件卸载时调用，避免对已卸载组件 setState）。
 */
export function runAfterFirstPaint(
  cb: () => void,
  opts: { delayMs?: number; timeoutMs?: number } = {},
): () => void {
  if (typeof window === 'undefined') return () => {}
  const delayMs = opts.delayMs ?? 0
  const timeoutMs = opts.timeoutMs ?? 2000
  let cancelled = false
  /** 已排程的取消动作（定时器/空闲回调/rAF） */
  const cancels: (() => void)[] = []

  const scheduleTimeout = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      if (!cancelled) fn()
    }, ms)
    cancels.push(() => window.clearTimeout(id))
  }

  const scheduleIdle = (fn: () => void) => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout?: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(() => {
        if (!cancelled) fn()
      }, { timeout: timeoutMs })
      cancels.push(() => w.cancelIdleCallback?.(id))
      return
    }
    scheduleTimeout(fn, Math.min(300, timeoutMs))
  }

  const start = () => {
    if (cancelled) return
    if (delayMs > 0) scheduleTimeout(() => scheduleIdle(cb), delayMs)
    else scheduleIdle(cb)
  }

  if (typeof window.requestAnimationFrame === 'function') {
    const id = window.requestAnimationFrame(start)
    cancels.push(() => window.cancelAnimationFrame(id))
  } else {
    scheduleTimeout(start, delayMs)
  }

  return () => {
    cancelled = true
    for (const cancel of cancels) cancel()
  }
}
