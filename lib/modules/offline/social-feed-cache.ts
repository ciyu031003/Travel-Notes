/**
 * 旅行圈 Feed 本地缓存（P2 · 预缓存 8–10 篇 + 渐进式后台缓存）。
 *
 * 为什么要这一层：/circle 之前是「在线优先 + 失败回退」，而 Web 端
 * platform.isNativePlatform() === false 时完全退化成纯网络 —— 每次打开都是骨架屏，
 * 要等 /api/social/posts 回来才有内容。这里把「读本地 / 拉云端 / 什么时候信谁」
 * 收敛成一套**带校验**的缓存，供 TravelCircleFeed 直接用：
 *
 *  · 结构版本：schemaVersion 不符 → 整份丢弃（旧字段形状可能和新 Post 对不上，
 *    宁可重拉一次，也不要拿错位数据渲染）；
 *  · 账号隔离：快照带 owner（当前会话 User.id；未登录 = anon）。登录/换号/登出
 *    导致 owner 变化时先清缓存再切标记，绝不串号（原生端由 account-scope 整库清空兜底）；
 *  · 新鲜度 TTL：TTL 内的缓存不再重复预取后续页（省流量，也不和首屏抢带宽）；
 *  · 容量上限：最多 60 篇或 3MB（先到为准），按 publishedAt 保留最新；
 *  · 删除/下架：Feed 在 publishedAt 顺序窗口内「不该缺却缺了」→ 判定已下线并从缓存剔除；
 *    详情接口 404 也会精确移除（removeFeedCachePost）。
 *
 * 存储介质（对上层同一套 API）：
 *  · 原生端 → SQLite social_post（写走 pull.applyPullEntity，读走 social-read，天然带列自省/LWW）；
 *  · Web 端 → IndexedDB 单条快照（不可用/被禁用时退化 localStorage）。
 *
 * 一律 best-effort：读不到就当没有（走网络），写失败也不阻断渲染 —— 缓存是可再生的。
 */
import { apiUrl } from '@/lib/api-base'
import { isNativePlatform } from './platform'
import { readLocalSocialFeed } from './social-read'
import { applyPullEntity } from './pull'
import { queryRows } from './dao'
import { getOfflineDb, toRows, rowGet } from './native/sqlite-db'
import { getMeta, setMeta } from './meta'

/** 缓存快照结构版本：Post 形状/语义变化时 +1，老快照会被整体丢弃重拉 */
export const SOCIAL_FEED_CACHE_SCHEMA_VERSION = 1
/** 缓存条数上限（先到为准：60 篇） */
export const SOCIAL_FEED_CACHE_MAX_POSTS = 60
/** 缓存体积上限（先到为准：3MB） */
export const SOCIAL_FEED_CACHE_MAX_BYTES = 3 * 1024 * 1024
/** 冷启动先渲染多少篇（用户要求「打开先看最新 8–10 篇」） */
export const SOCIAL_FEED_FIRST_RENDER_COUNT = 10
/** 缓存新鲜度 TTL：TTL 内跳过后续页预取 */
export const SOCIAL_FEED_CACHE_TTL_MS = 5 * 60 * 1000
/** 账号作用域校验的进程内 TTL（与 account-scope 一致，避免每次打开都打 /api/me） */
const SCOPE_TTL_MS = 60_000
const SCOPE_MARKER_KEY = 'tn.socialFeed.scope'
const ANON_SCOPE = 'anon'
const NATIVE_SCOPE = 'native'
const NATIVE_CACHED_AT_KEY = 'socialFeedCachedAt'
const NATIVE_TOTAL_KEY = 'socialFeedTotal'

export interface FeedCacheAuthor {
  id: number
  username: string
  nickname?: string | null
  avatarUrl?: string | null
}

/** 与 /api/social/posts 的 Feed 项形状一致（多存了 publishedAt/travelId 供排序与定位） */
export interface FeedCachePost {
  id: number
  travelId?: number | null
  title: string
  summary: string | null
  coverUrl: string | null
  location: string | null
  startDate: string | null
  endDate: string | null
  dayCount: number
  photoCount: number
  travelType?: string | null
  author: FeedCacheAuthor | null
  likeCount: number
  commentCount: number
  favoriteCount: number
  isLiked: boolean
  isFavorited: boolean
  publishedAt: string | null
}

export interface FeedCacheSnapshot {
  scope: string
  schemaVersion: number
  /** 最近一次写入时间（毫秒）；用于新鲜度判断与「已缓存」提示 */
  cachedAt: number
  /** 最近一次已知的远端总数（离线渲染时可能为 null） */
  total: number | null
  items: FeedCachePost[]
}

export type FeedCacheScopeResult = 'ok' | 'switched' | 'guest' | 'unknown'

/* ══════════════════════════════════════════════════════════════════════════
   1. 纯函数（排序 / 合并 / 裁剪 / 结构校验）—— 便于单测与复用
   ══════════════════════════════════════════════════════════════════════════ */

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toStr(value: unknown): string {
  if (typeof value === 'string') return value
  return value == null ? '' : String(value)
}

function toNullableStr(value: unknown): string | null {
  return value == null ? null : toStr(value)
}

/** publishedAt → 毫秒（缺失/非法返回 0，排序时落到最旧） */
export function feedPostTime(post: { publishedAt?: string | null }): number {
  if (!post.publishedAt) return 0
  const ms = Date.parse(post.publishedAt)
  return Number.isNaN(ms) ? 0 : ms
}

/** 单条校验 + 规整：结构不符返回 null（调用方据此判定整份缓存不可用） */
export function normalizeFeedCachePost(raw: unknown): FeedCachePost | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = Number(row.id)
  if (!Number.isFinite(id) || id <= 0) return null
  let author: FeedCacheAuthor | null = null
  const rawAuthor = row.author
  if (rawAuthor && typeof rawAuthor === 'object') {
    const a = rawAuthor as Record<string, unknown>
    const authorId = Number(a.id)
    if (Number.isFinite(authorId)) {
      author = {
        id: authorId,
        username: toStr(a.username),
        nickname: toNullableStr(a.nickname),
        avatarUrl: toNullableStr(a.avatarUrl),
      }
    }
  }
  return {
    id,
    travelId: row.travelId == null ? null : toInt(row.travelId),
    title: toStr(row.title),
    summary: toNullableStr(row.summary),
    coverUrl: toNullableStr(row.coverUrl),
    location: toNullableStr(row.location),
    startDate: toNullableStr(row.startDate),
    endDate: toNullableStr(row.endDate),
    dayCount: toInt(row.dayCount),
    photoCount: toInt(row.photoCount),
    travelType: toNullableStr(row.travelType),
    author,
    likeCount: toInt(row.likeCount),
    commentCount: toInt(row.commentCount),
    favoriteCount: toInt(row.favoriteCount),
    isLiked: row.isLiked === true,
    isFavorited: row.isFavorited === true,
    publishedAt: toNullableStr(row.publishedAt),
  }
}

/** 按 publishedAt 倒序（同时间按 id 倒序，保证排序稳定可复现） */
export function sortFeedCacheItems(items: FeedCachePost[]): FeedCachePost[] {
  return items.slice().sort((a, b) => {
    const diff = feedPostTime(b) - feedPostTime(a)
    if (diff !== 0) return diff
    return Number(b.id) - Number(a.id)
  })
}

/**
 * 合并两批缓存：同 id 用 incoming 覆盖（计数/点赞态以新拉到的为准），
 * 再按 publishedAt 重排 —— 这样「新文章插入顶部」是排序自然结果，不需要拼接顺序。
 */
export function mergeFeedCacheItems(base: FeedCachePost[], incoming: FeedCachePost[]): FeedCachePost[] {
  const byId = new Map<number, FeedCachePost>()
  for (const item of base) byId.set(Number(item.id), item)
  for (const item of incoming) byId.set(Number(item.id), item)
  return sortFeedCacheItems(Array.from(byId.values()))
}

/** 序列化后的近似字节数（TextEncoder 不可用时按 UTF-16 双字节估算） */
export function measureFeedCacheBytes(items: FeedCachePost[]): number {
  let json: string
  try {
    json = JSON.stringify(items)
  } catch {
    return 0
  }
  try {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).length
  } catch {
    /* 退化到长度估算 */
  }
  return json.length * 2
}

/** 容量收敛：先按条数，再按字节（先到为准），永远保留 publishedAt 最新的那批 */
export function trimFeedCacheItems(
  items: FeedCachePost[],
  maxPosts = SOCIAL_FEED_CACHE_MAX_POSTS,
  maxBytes = SOCIAL_FEED_CACHE_MAX_BYTES,
): { items: FeedCachePost[]; bytes: number; dropped: number } {
  const sorted = sortFeedCacheItems(items)
  let kept = sorted.slice(0, Math.max(0, maxPosts))
  let dropped = sorted.length - kept.length
  let bytes = measureFeedCacheBytes(kept)
  // 逐条从最旧端淘汰；最多淘汰到空（极端脏数据下宁可清空也不写超限）
  while (kept.length > 0 && bytes > maxBytes) {
    kept = kept.slice(0, kept.length - 1)
    dropped += 1
    bytes = measureFeedCacheBytes(kept)
  }
  return { items: kept, bytes, dropped }
}

/** 结构校验：schemaVersion / scope / items 形状，任一不符整份作废 */
export function parseFeedCacheSnapshot(raw: unknown, scope: string): FeedCacheSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (toInt(row.schemaVersion) !== SOCIAL_FEED_CACHE_SCHEMA_VERSION) return null
  if (typeof row.scope !== 'string' || row.scope !== scope) return null
  if (!Array.isArray(row.items)) return null
  const items: FeedCachePost[] = []
  for (const entry of row.items) {
    const normalized = normalizeFeedCachePost(entry)
    if (!normalized) return null
    items.push(normalized)
  }
  const trimmed = trimFeedCacheItems(items)
  if (trimmed.items.length === 0) return null
  return {
    scope,
    schemaVersion: SOCIAL_FEED_CACHE_SCHEMA_VERSION,
    cachedAt: toInt(row.cachedAt),
    total: row.total == null ? null : toInt(row.total),
    items: trimmed.items,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   2. 账号作用域（Web 端自管；原生端由 account-scope 整库清空保证）
   ══════════════════════════════════════════════════════════════════════════ */

let lastScopeCheckedAt = 0
let lastScopeResult: FeedCacheScopeResult = 'unknown'
/** 账号作用域是否已判定过一次（冷启动首帧别把缓存写到「还没认领」的作用域上） */
let scopeSettled = false
let scopeSettledResolvers: Array<() => void> = []

function markScopeSettled(): void {
  if (scopeSettled) return
  scopeSettled = true
  const pending = scopeSettledResolvers
  scopeSettledResolvers = []
  for (const resolve of pending) resolve()
}

/**
 * 等「账号作用域首次判定」完成（最多 timeoutMs）。
 *
 * 为什么写入要等它：冷启动时本地标记还没认领（默认 anon），如果这时先把缓存写进
 * anon 作用域，紧接着 /api/me 认出真实账号 → 切换作用域会把刚写的数据整份清掉
 * （表现为「明明拉了两页，缓存只有 12 篇」）。写入侧等一小会儿即可，读路径不等（首屏要快）。
 */
export function whenFeedCacheScopeSettled(timeoutMs = 2000): Promise<void> {
  if (scopeSettled || typeof window === 'undefined') return Promise.resolve()
  return new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    scopeSettledResolvers.push(finish)
    try {
      window.setTimeout(finish, timeoutMs)
    } catch {
      finish()
    }
  })
}

/** 当前本地缓存归属（同步、不联网）：Web 读 localStorage 标记，原生端固定 native */
export function getFeedCacheScope(): string {
  if (typeof window === 'undefined') return ANON_SCOPE
  if (isNativePlatform()) return NATIVE_SCOPE
  try {
    return localStorage.getItem(SCOPE_MARKER_KEY) || ANON_SCOPE
  } catch {
    return ANON_SCOPE
  }
}

function setFeedCacheScope(scope: string): void {
  if (typeof window === 'undefined' || isNativePlatform()) return
  try {
    localStorage.setItem(SCOPE_MARKER_KEY, scope)
  } catch {
    /* 隐私模式下写不了：作用域退化为 anon，下次打开会再校验 */
  }
}

type ViewerAccount = { kind: 'account'; id: string } | { kind: 'guest' } | { kind: 'unknown' }

/** 当前查看者身份：区分「未登录（可判定）」与「网络不可达（不可判定）」 */
async function fetchViewerAccount(): Promise<ViewerAccount> {
  try {
    const res = await fetch(apiUrl('/api/me'), {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (res.status === 401 || res.status === 403) return { kind: 'guest' }
    if (!res.ok) return { kind: 'unknown' }
    const json = (await res.json()) as { data?: { id?: unknown } } | null
    const raw = json?.data?.id
    if (raw == null) return { kind: 'guest' }
    const id = String(raw)
    if (!id || id === 'undefined' || id === 'null') return { kind: 'guest' }
    return { kind: 'account', id }
  } catch {
    // 离线/网关错误：按「未知」处理，绝不清缓存（离线数据不能被误删）
    return { kind: 'unknown' }
  }
}

/**
 * 校验缓存归属与当前会话账号是否一致。
 * 不一致（登录、切换账号、退出登录）→ 先清缓存再切换标记。
 * 离线无法判定 → 保持现状（离线优先：宁可少清一次，也不清空用户离线数据）。
 */
export async function verifyFeedCacheScope(options?: { force?: boolean }): Promise<FeedCacheScopeResult> {
  if (typeof window === 'undefined') return 'unknown'
  if (isNativePlatform()) {
    markScopeSettled()
    return 'ok'
  }
  if (!options?.force && Date.now() - lastScopeCheckedAt < SCOPE_TTL_MS) return lastScopeResult
  const viewer = await fetchViewerAccount()
  lastScopeCheckedAt = Date.now()
  if (viewer.kind === 'unknown') {
    lastScopeResult = 'unknown'
    markScopeSettled()
    return 'unknown'
  }
  const next = viewer.kind === 'account' ? viewer.id : ANON_SCOPE
  const prev = getFeedCacheScope()
  if (prev === next) {
    lastScopeResult = 'ok'
    markScopeSettled()
    return 'ok'
  }
  await clearFeedCache()
  setFeedCacheScope(next)
  lastScopeResult = viewer.kind === 'guest' ? 'guest' : 'switched'
  markScopeSettled()
  return lastScopeResult
}

/** 测试/登出后重置进程内 TTL，避免下一次校验被短路 */
export function resetFeedCacheScopeCache(): void {
  lastScopeCheckedAt = 0
  lastScopeResult = 'unknown'
  scopeSettled = false
  scopeSettledResolvers = []
}

/** 缓存是否仍新鲜（TTL 内）：用于跳过后续页预取 */
export function isFeedCacheFresh(cachedAt: number, ttlMs = SOCIAL_FEED_CACHE_TTL_MS): boolean {
  return cachedAt > 0 && Date.now() - cachedAt < ttlMs
}

/* ══════════════════════════════════════════════════════════════════════════
   3. 网络能力探测（离线 / 省流量时跳过后台拉取）
   ══════════════════════════════════════════════════════════════════════════ */

export function isNetworkOnline(): boolean {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  } catch {
    /* 探测不了按在线处理，交给 fetch 自己失败 */
  }
  return true
}

export function isDataSaverEnabled(): boolean {
  try {
    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
    }
    const conn = nav.connection
    if (!conn) return false
    if (conn.saveData === true) return true
    return conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g'
  } catch {
    return false
  }
}

/** 是否允许后台拉取（离线 / 省流量时一律跳过） */
export function canBackgroundFetch(): boolean {
  return isNetworkOnline() && !isDataSaverEnabled()
}

/* ══════════════════════════════════════════════════════════════════════════
   4. Web 存储：IndexedDB 单条快照（失败退化 localStorage）
   ══════════════════════════════════════════════════════════════════════════ */

const WEB_DB_NAME = 'tn-social-feed'
const WEB_DB_VERSION = 1
const WEB_STORE = 'snapshots'
const WEB_LS_PREFIX = 'tn.socialFeed.snapshot.'
let webDbPromise: Promise<IDBDatabase | null> | null = null

function openWebDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (webDbPromise) return webDbPromise
  webDbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(WEB_DB_NAME, WEB_DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      try {
        const db = request.result
        if (!db.objectStoreNames.contains(WEB_STORE)) db.createObjectStore(WEB_STORE, { keyPath: 'scope' })
      } catch {
        /* 建表失败：读路径会退化为 localStorage */
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
  return webDbPromise
}

function webDbRead(scope: string): Promise<unknown> {
  return openWebDb().then((db) => {
    if (!db) return readLocalFallback(scope)
    return new Promise<unknown>((resolve) => {
      try {
        const tx = db.transaction(WEB_STORE, 'readonly')
        const request = tx.objectStore(WEB_STORE).get(scope)
        request.onsuccess = () => resolve(request.result == null ? readLocalFallback(scope) : request.result)
        request.onerror = () => resolve(readLocalFallback(scope))
      } catch {
        resolve(readLocalFallback(scope))
      }
    })
  })
}

function webDbWrite(snapshot: FeedCacheSnapshot): Promise<void> {
  return openWebDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        if (!db) {
          writeLocalFallback(snapshot)
          resolve()
          return
        }
        try {
          const tx = db.transaction(WEB_STORE, 'readwrite')
          tx.objectStore(WEB_STORE).put(snapshot)
          tx.oncomplete = () => resolve()
          tx.onerror = () => {
            writeLocalFallback(snapshot)
            resolve()
          }
          tx.onabort = () => resolve()
        } catch {
          writeLocalFallback(snapshot)
          resolve()
        }
      }),
  )
}

function webDbDelete(scope?: string): Promise<void> {
  return openWebDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        if (scope) clearLocalFallback(scope)
        else clearLocalFallback()
        if (!db) {
          resolve()
          return
        }
        try {
          const tx = db.transaction(WEB_STORE, 'readwrite')
          const store = tx.objectStore(WEB_STORE)
          if (scope) store.delete(scope)
          else store.clear()
          tx.oncomplete = () => resolve()
          tx.onerror = () => resolve()
          tx.onabort = () => resolve()
        } catch {
          resolve()
        }
      }),
  )
}

function readLocalFallback(scope: string): unknown {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(WEB_LS_PREFIX + scope)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeLocalFallback(snapshot: FeedCacheSnapshot): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(WEB_LS_PREFIX + snapshot.scope, JSON.stringify(snapshot))
  } catch {
    // 配额不足：退化为只留首屏那几篇，再失败就放弃（缓存可再生）
    try {
      const slim: FeedCacheSnapshot = { ...snapshot, items: snapshot.items.slice(0, SOCIAL_FEED_FIRST_RENDER_COUNT) }
      localStorage.setItem(WEB_LS_PREFIX + snapshot.scope, JSON.stringify(slim))
    } catch {
      /* 放弃写入 */
    }
  }
}

function clearLocalFallback(scope?: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (scope) {
      localStorage.removeItem(WEB_LS_PREFIX + scope)
      return
    }
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && key.indexOf(WEB_LS_PREFIX) === 0) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    /* best-effort */
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   5. 原生存储：SQLite social_post（列自省 / LWW 由 applyPullEntity 负责）
   ══════════════════════════════════════════════════════════════════════════ */

function isoToMs(value: string | null): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

async function readNativeSnapshot(scope: string): Promise<FeedCacheSnapshot | null> {
  const rows = await readLocalSocialFeed()
  if (!rows || rows.length === 0) return null
  const items: FeedCachePost[] = []
  for (const row of rows) {
    const normalized = normalizeFeedCachePost(row)
    if (normalized) items.push(normalized)
  }
  if (items.length === 0) return null
  const trimmed = trimFeedCacheItems(items)
  if (trimmed.items.length === 0) return null
  const cachedAtRaw = await getMeta(NATIVE_CACHED_AT_KEY)
  const totalRaw = await getMeta(NATIVE_TOTAL_KEY)
  return {
    scope,
    schemaVersion: SOCIAL_FEED_CACHE_SCHEMA_VERSION,
    cachedAt: toInt(cachedAtRaw),
    total: totalRaw == null ? null : toInt(totalRaw),
    items: trimmed.items,
  }
}

async function writeNativeSnapshot(snapshot: FeedCacheSnapshot): Promise<void> {
  for (const post of snapshot.items) {
    const publishedMs = feedPostTime(post)
    try {
      await applyPullEntity({
        table: 'social_post',
        id: String(post.id),
        remoteId: Number(post.id),
        updatedAt: publishedMs || Date.now(),
        data: {
          title: post.title,
          summary: post.summary,
          coverUrl: post.coverUrl,
          location: post.location,
          startDate: isoToMs(post.startDate),
          endDate: isoToMs(post.endDate),
          dayCount: post.dayCount,
          photoCount: post.photoCount,
          authorId: post.author ? post.author.id : null,
          authorName: post.author ? post.author.username : null,
          authorNickname: post.author ? post.author.nickname ?? null : null,
          authorAvatar: post.author ? post.author.avatarUrl ?? null : null,
          likeCount: post.likeCount,
          commentCount: post.commentCount,
          favoriteCount: post.favoriteCount,
          isLiked: post.isLiked ? 1 : 0,
          isFavorited: post.isFavorited ? 1 : 0,
          publishedAt: publishedMs || null,
        },
      })
    } catch {
      // 单条写失败（老库缺列等）不影响其余条目，也不阻断页面
    }
  }
  await trimNativeTable()
  await setMeta(NATIVE_CACHED_AT_KEY, snapshot.cachedAt)
  if (snapshot.total != null) await setMeta(NATIVE_TOTAL_KEY, snapshot.total)
}

/** 原生端容量收敛：先按 60 篇，再按估算体积 3MB 从最旧开始淘汰 */
async function trimNativeTable(): Promise<void> {
  try {
    const db = await getOfflineDb()
    await db.run(
      'DELETE FROM social_post WHERE id IN (SELECT id FROM social_post WHERE deleted = 0 ' +
        'ORDER BY COALESCE(publishedAt, updatedAt) DESC LIMIT -1 OFFSET ?)',
      [SOCIAL_FEED_CACHE_MAX_POSTS],
    )
    for (let guard = 0; guard < SOCIAL_FEED_CACHE_MAX_POSTS; guard += 1) {
      const rows = toRows(
        await db.query(
          "SELECT COUNT(*) AS c, SUM(LENGTH(IFNULL(coverUrl,'')) + LENGTH(IFNULL(title,'')) + " +
            "LENGTH(IFNULL(summary,'')) + LENGTH(IFNULL(location,'')) + 96) AS b FROM social_post WHERE deleted = 0",
        ),
      )
      const count = rows[0] ? Number(rowGet(rows[0], 'c', 0)) : 0
      const bytes = rows[0] ? Number(rowGet(rows[0], 'b', 1)) : 0
      if (count === 0 || !Number.isFinite(bytes) || bytes <= SOCIAL_FEED_CACHE_MAX_BYTES) return
      await db.run(
        'DELETE FROM social_post WHERE id = (SELECT id FROM social_post WHERE deleted = 0 ' +
          'ORDER BY COALESCE(publishedAt, updatedAt) ASC LIMIT 1)',
      )
    }
  } catch {
    /* 容量收敛失败不阻断缓存写入 */
  }
}

async function pruneNative(keepIds: Set<number>, newerThanMs: number): Promise<number> {
  if (!(newerThanMs > 0)) return 0
  const rows = await queryRows('SELECT id, remoteId, publishedAt, updatedAt FROM social_post WHERE deleted = 0')
  if (rows.length === 0) return 0
  const db = await getOfflineDb()
  let removed = 0
  for (const row of rows) {
    const publishedMs = Number(rowGet(row, 'publishedAt')) || Number(rowGet(row, 'updatedAt')) || 0
    if (publishedMs <= newerThanMs) continue
    if (keepIds.has(Number(rowGet(row, 'remoteId')))) continue
    try {
      await db.run('DELETE FROM social_post WHERE id = ?', [String(rowGet(row, 'id'))])
      removed += 1
    } catch {
      /* 单条删除失败跳过 */
    }
  }
  return removed
}

/* ══════════════════════════════════════════════════════════════════════════
   6. 对外 API
   ══════════════════════════════════════════════════════════════════════════ */

/** 读本地缓存；结构版本不符/字段损坏 → 丢弃并返回 null（调用方走网络重拉） */
export async function readFeedCache(): Promise<FeedCacheSnapshot | null> {
  if (typeof window === 'undefined') return null
  const scope = getFeedCacheScope()
  try {
    if (isNativePlatform()) return await readNativeSnapshot(scope)
    const raw = await webDbRead(scope)
    if (raw == null) return null
    const snapshot = parseFeedCacheSnapshot(raw, scope)
    if (!snapshot) {
      await webDbDelete(scope)
      return null
    }
    return snapshot
  } catch {
    return null
  }
}

/**
 * 写入缓存（与已有缓存合并、按容量收敛）。
 * @param incoming 新拉到的 Feed 项
 * @param options.total 远端总数；replace=true 时以 incoming 覆盖（不带旧缓存）
 */
export async function writeFeedCache(
  incoming: FeedCachePost[],
  options?: { total?: number | null; cachedAt?: number; replace?: boolean },
): Promise<FeedCacheSnapshot | null> {
  if (typeof window === 'undefined') return null
  const normalized: FeedCachePost[] = []
  for (const item of incoming) {
    const post = normalizeFeedCachePost(item)
    if (post) normalized.push(post)
  }
  if (normalized.length === 0) return null
  // 先等作用域认领（最多 2s）：否则冷启动可能把数据写进 anon 作用域、随后被换号清理抹掉
  await whenFeedCacheScopeSettled()
  const scope = getFeedCacheScope()
  try {
    const existing = options?.replace ? null : await readFeedCache()
    const merged = existing ? mergeFeedCacheItems(existing.items, normalized) : sortFeedCacheItems(normalized)
    const trimmed = trimFeedCacheItems(merged)
    if (trimmed.items.length === 0) return null
    const snapshot: FeedCacheSnapshot = {
      scope,
      schemaVersion: SOCIAL_FEED_CACHE_SCHEMA_VERSION,
      cachedAt: options?.cachedAt ?? Date.now(),
      total: options?.total === undefined ? existing?.total ?? null : options.total,
      items: trimmed.items,
    }
    if (isNativePlatform()) await writeNativeSnapshot(snapshot)
    else await webDbWrite(snapshot)
    return snapshot
  } catch {
    return null
  }
}

/** 精确移除一篇（详情接口 404 / 确认下线时用） */
export async function removeFeedCachePost(postId: number | string): Promise<void> {
  if (typeof window === 'undefined') return
  const id = Number(postId)
  if (!Number.isFinite(id) || id <= 0) return
  try {
    if (isNativePlatform()) {
      const db = await getOfflineDb()
      await db.run('DELETE FROM social_post WHERE remoteId = ? OR id = ?', [id, String(postId)])
      return
    }
    const snapshot = await readFeedCache()
    if (!snapshot) return
    const items = snapshot.items.filter((item) => Number(item.id) !== id)
    if (items.length === snapshot.items.length) return
    if (items.length === 0) {
      await webDbDelete(snapshot.scope)
      return
    }
    await webDbWrite({ ...snapshot, items })
  } catch {
    /* best-effort */
  }
}

/**
 * 下线清理：publishedAt 落在「已完整拉取的窗口」内、却不在远端结果里的缓存项 → 判定已删除/下架。
 * 调用方必须保证 keepIds 覆盖该窗口（page1..pageN 连续拉齐），否则会误删。
 */
export async function pruneFeedCachePosts(options: { keepIds: Set<number>; newerThanMs: number }): Promise<number> {
  if (typeof window === 'undefined') return 0
  const { keepIds, newerThanMs } = options
  if (!(newerThanMs > 0) || keepIds.size === 0) return 0
  try {
    if (isNativePlatform()) return await pruneNative(keepIds, newerThanMs)
    const snapshot = await readFeedCache()
    if (!snapshot) return 0
    const items = snapshot.items.filter((item) => !(feedPostTime(item) > newerThanMs && !keepIds.has(Number(item.id))))
    const removed = snapshot.items.length - items.length
    if (removed === 0) return 0
    if (items.length === 0) await webDbDelete(snapshot.scope)
    else await webDbWrite({ ...snapshot, items })
    return removed
  } catch {
    return 0
  }
}

/** 清空旅行圈缓存（登出 / 换号 / 切换作用域） */
export async function clearFeedCache(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    if (isNativePlatform()) {
      const db = await getOfflineDb()
      await db.run('DELETE FROM social_post')
      return
    }
    await webDbDelete()
  } catch {
    /* best-effort */
  }
}
