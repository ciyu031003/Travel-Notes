'use client'

/**
 * 本地优先读取层（local-first / stale-while-revalidate）—— P1
 * ============================================================================
 * 目标：**打开页面先看到上次的内容，再在后台悄悄对齐云端**；离线时不白屏、不转圈，
 * 联网后自动补齐。所有判断（能不能读本地、要不要拉云端、失败怎么退）都收口在这里，
 * 页面只表达「数据 + 状态」，不再各写一遍 fetch/缓存/兜底。
 *
 * 三种时机（对应需求里「何时读本地 / 何时拉云端」）：
 *   ① 本地 fresh（age ≤ ttlMs）      → **立即返回本地**（不转圈），在线且非省流量时仍后台静默校准；
 *   ② 本地 stale（ttlMs < age ≤ hardTtlMs）→ 立即返回本地 + 后台拉取，调用方标记「更新中」；
 *   ③ 本地 expired（age > hardTtlMs）/ 无本地 / 校验失败 → 走网络（此时才允许骨架屏），
 *      网络失败再退回本地并标记 offline（能看旧的，也好过白屏）。
 *
 * 校验机制（需求里的「全套校验」逐条落实）：
 *   · **新鲜度**：更新/读取都带 updatedAt，ttl / hardTtl 双阈值（软过期先渲染再对齐，硬过期才等网络）；
 *   · **结构版本**：落盘信封 { v, updatedAt, data }，v 与调用方 schemaVersion 不一致 → 视为未命中，
 *     旧结构永远不进渲染路径（字段改名后不会「渲染到一半崩」）；
 *   · **结构校验**：调用方可传 validate（isHomeData / isTravelList），写入与读回都过一遍；
 *   · **账号隔离**：key 前缀带账号作用域（anon / acc:<userId>），切号时清掉旧命名空间并通知
 *     所有订阅方丢弃内存快照；clearLocalFirstCache() 供退出登录调用；
 *   · **省流量/离线**：navigator.connection.saveData / 2G 网络 / navigator.onLine 为 false 时
 *     不做后台拉取（有本地就只渲染本地）；
 *   · **失败回退**：网络失败 → 本地（标记 offline）；401 → 清本地（隐私）并交给页面跳登录。
 *
 * 分层（由近到远）：
 *   · localStorage 同步镜像（lib/client/persisted-cache，**首帧同步可读**，容量小）；
 *   · IndexedDB（Web，lib/modules/offline/web-cache，容量大、异步）；
 *   · SQLite home_snapshot（原生，本地优先层的持久底座）。
 * 读取取「最新的一份」，写入三层都写（失败静默）；IDB 命中比镜像新时顺手回填镜像。
 *
 * 可测试性：核心编排 runLocalFirstRefresh 接受注入的 store/env（见 tests/unit/local-first.test.ts），
 * 不依赖 window/IDB，纯逻辑可单测；页面侧用 localFirst() / readLocalFirstSync()。
 */
import { isSessionExpiredError } from '@/lib/client/api'
import {
  clearPersistedCache,
  dropPersistedCache,
  inspectPersistedCache,
  persistSoon,
  readPersistedCache,
  runAfterFirstPaint,
  writePersistedCache,
} from '@/lib/client/persisted-cache'
import { getOfflineAccountId, resolveCurrentAccountId } from './account-scope'
import {
  deleteOfflineSnapshot,
  deleteOfflineSnapshotsByPrefix,
  readHomeSnapshot,
  readOfflineSnapshotValue,
  renameOfflineSnapshotPrefix,
  saveOfflineSnapshotValue,
} from './home-snapshot'
import { isNativePlatform } from './platform'
import { isOnline as probeNetworkOnline } from './repository'
import {
  clearWebCache,
  deleteWebCache,
  isWebCacheSupported,
  readWebCache,
  renameWebCachePrefix,
  webCacheStats,
  writeWebCache,
} from './web-cache'

/** 信封版本（本地优先层的落盘格式）。格式本身变更时 +1；业务结构变更走调用方 schemaVersion */
export const LOCAL_FIRST_ENVELOPE_VERSION = 1
/** 两次后台校准之间的最小间隔：连续切 tab / StrictMode 双挂载不该重复发请求 */
const REVALIDATE_MIN_INTERVAL_MS = 5_000
/** localStorage 键前缀（与 persisted-cache 自身的 tn:pc:v1: 命名空间隔离） */
const KEY_PREFIX = 'lf:'
/** 账号作用域（存 localStorage：需要同步读，决定首帧读哪个命名空间） */
const ACCOUNT_STORAGE_KEY = 'tn:lf:account'
/** 省流量偏好（0/1；未设置时跟随 navigator.connection） */
const SAVE_DATA_STORAGE_KEY = 'tn:lf:save-data'

export type LocalFirstFreshness = 'fresh' | 'stale' | 'expired'
export type LocalFirstSkipReason = 'offline' | 'save-data' | 'recent' | null

/** 命名空间作用域：'anon' 或 'acc:<userId>' */
export type LocalFirstScope = string

export interface LocalFirstSnapshot<T> {
  data: T
  /** 落盘时间（ms） */
  updatedAt: number
  /** 距 now 的毫秒数 */
  ageMs: number
  /** fresh=可直读；stale=先渲染再校准；expired=仅作网络失败兜底 */
  freshness: LocalFirstFreshness
}

/** 本地存下来的一条记录（不含新鲜度判定） */
export interface LocalFirstRecord<T> {
  data: T
  updatedAt: number
  /** true = 早期格式（原始响应，无信封版本） */
  legacy?: boolean
}

export interface LocalFirstStore<T> {
  /** 逻辑 key（不含作用域前缀） */
  key: string
  /** 只读 localStorage 同步镜像（首帧用，必须同步返回） */
  readSync(): LocalFirstRecord<T> | null
  /** 读最新的一份（localStorage / IDB / SQLite 取更新者，异步） */
  read(): Promise<LocalFirstRecord<T> | null>
  write(data: T): Promise<void>
  remove(): Promise<void>
}

export interface LocalFirstRefreshResult<T> {
  data: T | null
  /** remote=刚从云端拿到；local=退回本地；none=什么都没有 */
  source: 'remote' | 'local' | 'none'
  error: string
  /** true = 云端不可达（渲染侧显示离线标记，且不清空已有内容） */
  offline: boolean
  /** true = 本轮没有真正发请求（离线/省流量/刚拉过） */
  skipped: boolean
  skipReason: LocalFirstSkipReason
  /** 失败回退时实际使用的本地数据 */
  hit: LocalFirstSnapshot<T> | null
}

export interface LocalFirstPrepare<T> {
  /** 命中的本地数据（null = 没有可用本地，页面走骨架屏） */
  hit: LocalFirstSnapshot<T> | null
  /** 后台刷新承诺（永不 reject；失败通过 error/offline 表达） */
  refresh: Promise<LocalFirstRefreshResult<T>>
}

export interface LocalFirstConfigBase<T> {
  /** 逻辑 key（建议直接用接口 path，便于排查；内部会拼上作用域前缀） */
  key: string
  /** 软新鲜期：小于它直接读本地，不阻塞 UI */
  ttlMs: number
  /** 硬新鲜期：超过它就必须等网络（仍然失败回退） */
  hardTtlMs: number
  /** 结构校验：写入前与读回后都会调用（返回 false 视为损坏） */
  validate?: (value: unknown) => value is T
  /** 业务结构版本：结构与上次不同时 +1，旧缓存自动失效 */
  schemaVersion?: number
  /** 单条上限（字符数近似，默认沿用 persisted-cache 的 256K） */
  maxEntryBytes?: number
  /** 原生端兼容：早期写入的旧快照 key（如首页的 'home'），找不到新 key 时读它 */
  legacyNativeKey?: string
  /** 是否尊重省流量开关（默认 true） */
  respectSaveData?: boolean
  /** 后台校准最小间隔（默认 5s） */
  revalidateMinIntervalMs?: number
}

export interface LocalFirstConfig<T> extends LocalFirstConfigBase<T> {
  /** 真正的网络取数（内部自行处理 credentials / cache 策略） */
  fetchRemote: () => Promise<T>
  /** 强制绕过「最近刚拉过」的判断（用户下拉刷新时用） */
  force?: boolean
}

/** 可注入的运行环境（单测替换掉真实网络/导航器判断） */
export interface LocalFirstEnv {
  isOnline(): Promise<boolean>
  isSaveData(): boolean
  now(): number
}

// ── 账号作用域 ────────────────────────────────────────────────

let scopeCache: LocalFirstScope | null = null
let scopeProbe: Promise<boolean> | null = null
let scopeScheduled = false
const scopeListeners = new Set<(scope: LocalFirstScope) => void>()

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function readStorage(key: string): string | null {
  if (!isBrowser()) return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 配额满/隐私模式：作用域降级为进程内，写入仍能工作（只是换账号后可能少清一次）
  }
}

/** 当前作用域（同步；首帧读取必须同步，所以以 localStorage 里的上次账号为准） */
export function getLocalFirstScope(): LocalFirstScope {
  if (!isBrowser()) return 'anon'
  if (scopeCache) return scopeCache
  const stored = readStorage(ACCOUNT_STORAGE_KEY)
  scopeCache = stored ? 'acc:' + stored : 'anon'
  return scopeCache
}

/** 带作用域的完整缓存 key（localStorage / IDB / SQLite 共用同一个字符串） */
function scopedKey(logicalKey: string): string {
  return KEY_PREFIX + getLocalFirstScope() + ':' + logicalKey
}

/** 订阅作用域变化（切号/退出登录后页面必须丢弃内存快照并重取） */
export function onLocalFirstScopeChange(listener: (scope: LocalFirstScope) => void): () => void {
  scopeListeners.add(listener)
  return () => {
    scopeListeners.delete(listener)
  }
}

function notifyScopeChange(scope: LocalFirstScope): void {
  scopeListeners.forEach((listener) => {
    try {
      listener(scope)
    } catch {
      // 单个订阅方异常不影响其它页面
    }
  })
}

/**
 * 校准账号作用域（每个进程最多一次；失败按「未知」处理，绝不清数据 —— 离线优先）。
 * @returns 是否发生了作用域切换
 */
export function ensureLocalFirstScope(): Promise<boolean> {
  if (!isBrowser()) return Promise.resolve(false)
  if (scopeProbe) return scopeProbe
  scopeProbe = probeScope().catch(() => false)
  return scopeProbe
}

/** 首帧之后调一次即可（不阻塞首屏；弹幕/登录态探测同一套调度） */
export function scheduleLocalFirstScopeCheck(): void {
  if (!isBrowser() || scopeScheduled) return
  scopeScheduled = true
  // 再让 600ms：首屏的 /api/home、/api/travels 先跑完，账号校准不该跟它们抢同一条连接
  runAfterFirstPaint(() => {
    void ensureLocalFirstScope()
  }, { delayMs: 600, timeoutMs: 2500 })
}

let resolvingAccountId: Promise<string | null> | null = null

/** 当前账号 id（原生优先读 SQLite meta，避免与 account-scope 重复发 /api/me） */
async function currentAccountId(): Promise<string | null> {
  if (isNativePlatform()) {
    const stored = await getOfflineAccountId().catch(() => null)
    if (stored) return stored
  }
  if (!resolvingAccountId) {
    resolvingAccountId = resolveCurrentAccountId().catch(() => null)
  }
  return resolvingAccountId
}

/**
 * 把一整个作用域命名空间搬到另一个（首次认领账号时 anon → acc:<id>）。
 *
 * 时机：账号 id 是异步校准出来的，首帧前不能阻塞，所以「第一次启动」的缓存可能先落在 anon
 * 命名空间。认领时把它搬过去，用户下次启动就能直接命中，而不是白等一次网络。
 * 三层都要搬：localStorage 镜像 / IndexedDB / 原生 SQLite 快照。
 */
async function migrateLocalFirstScope(fromScope: LocalFirstScope, toScope: LocalFirstScope): Promise<void> {
  if (!isBrowser() || fromScope === toScope) return
  const from = KEY_PREFIX + fromScope + ':'
  const to = KEY_PREFIX + toScope + ':'
  // ① localStorage 同步镜像（persisted-cache 的 key 是逻辑 key，前缀由它自己加）
  try {
    const entries = inspectPersistedCache()
    for (const entry of entries) {
      if (entry.key.indexOf(from) !== 0) continue
      const hit = readPersistedCache<unknown>(entry.key, { ttlMs: 0 })
      const nextKey = to + entry.key.slice(from.length)
      if (hit) writePersistedCache(nextKey, hit.value)
      dropPersistedCache(entry.key)
    }
  } catch {
    // 搬不动就放弃（下一轮网络会重新写）
  }
  // ② 持久层
  if (isNativePlatform()) {
    await renameOfflineSnapshotPrefix(from, to).catch(() => 0)
    return
  }
  await renameWebCachePrefix(from, to).catch(() => 0)
}

async function probeScope(): Promise<boolean> {
  const accountId = await currentAccountId()
  // 未登录 / 网络失败：保持现状（宁可少清一次，也不能把离线数据清空）
  if (!accountId) return false
  const stored = readStorage(ACCOUNT_STORAGE_KEY)
  if (stored === accountId) {
    scopeCache = 'acc:' + accountId
    return false
  }
  if (stored == null) {
    // 首次认领（老用户升级/第一次带缓存登录）：不清数据 —— 此时 anon 命名空间里只有
    // 未登录阶段产生的公开数据，清掉既不解决隐私问题，又会让本次已经渲染好的内容白丢一次。
    // 改为**原地搬迁** anon → acc:<id>：下次启动首帧就能命中（零额外请求）。
    await migrateLocalFirstScope('anon', 'acc:' + accountId)
    writeStorage(ACCOUNT_STORAGE_KEY, accountId)
    scopeCache = 'acc:' + accountId
    return false
  }
  // 换账号：上一个账号的本地缓存必须先清（隐私），再通知各页面丢弃内存快照并重取
  await clearLocalFirstStorage()
  writeStorage(ACCOUNT_STORAGE_KEY, accountId)
  scopeCache = 'acc:' + accountId
  notifyScopeChange(scopeCache)
  return true
}

/** 测试/登出后重置进程内作用域缓存 */
export function resetLocalFirstScopeCache(): void {
  scopeCache = null
  scopeProbe = null
  scopeScheduled = false
  resolvingAccountId = null
}

// ── 省流量 / 在线判断 ────────────────────────────────────────

interface NetworkInformationLike {
  saveData?: boolean
  effectiveType?: string
}

function getConnection(): NetworkInformationLike | null {
  if (typeof navigator === 'undefined') return null
  const nav = navigator as Navigator & { connection?: NetworkInformationLike }
  return nav.connection ?? null
}

/** 省流量模式：显式偏好优先，其次 navigator.connection.saveData / 2G 网络 */
export function isSaveDataEnabled(): boolean {
  if (!isBrowser()) return false
  const stored = readStorage(SAVE_DATA_STORAGE_KEY)
  if (stored === '1') return true
  if (stored === '0') return false
  const conn = getConnection()
  if (!conn) return false
  if (conn.saveData === true) return true
  return conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g'
}

/** 用户/设置页可写入省流量偏好（true=只在手动刷新时才拉云端） */
export function setSaveDataPreference(enabled: boolean): void {
  writeStorage(SAVE_DATA_STORAGE_KEY, enabled ? '1' : '0')
}

async function isOnlineSafe(): Promise<boolean> {
  try {
    return await probeNetworkOnline()
  } catch {
    if (typeof navigator === 'undefined') return true
    return navigator.onLine
  }
}

const DEFAULT_ENV: LocalFirstEnv = {
  isOnline: isOnlineSafe,
  isSaveData: isSaveDataEnabled,
  now: () => Date.now(),
}

// ── 信封解析与新鲜度 ────────────────────────────────────────

interface Envelope<T> {
  v: number
  updatedAt: number
  data: T
}

/**
 * 解析落盘信封（导出给单测与诊断用）。
 * 版本不一致 / 字段缺失 / 结构校验失败 → null（调用方当作未命中，**不抛**）。
 */
export function parseLocalFirstEnvelope<T = unknown>(
  raw: unknown,
  expectVersion: number,
  validate?: (value: unknown) => value is T,
): Envelope<T> | null {
  if (!raw || typeof raw !== 'object') return null
  const env = raw as { v?: unknown; updatedAt?: unknown; data?: unknown }
  if (env.v !== expectVersion) return null
  if (typeof env.updatedAt !== 'number' || !Number.isFinite(env.updatedAt) || env.updatedAt <= 0) return null
  if (!('data' in env)) return null
  if (validate && !validate(env.data)) return null
  return { v: env.v as number, updatedAt: env.updatedAt, data: env.data as T }
}

/** 按 age 判新鲜度（导出给单测） */
export function computeLocalFirstFreshness(
  ageMs: number,
  ttlMs: number,
  hardTtlMs: number,
): LocalFirstFreshness {
  if (ttlMs > 0 && ageMs <= ttlMs) return 'fresh'
  if (hardTtlMs > 0 && ageMs <= hardTtlMs) return 'stale'
  if (hardTtlMs <= 0) return 'stale'
  return 'expired'
}

function toSnapshot<T>(record: LocalFirstRecord<T>, ttlMs: number, hardTtlMs: number): LocalFirstSnapshot<T> {
  const ageMs = Math.max(0, Date.now() - record.updatedAt)
  return {
    data: record.data,
    updatedAt: record.updatedAt,
    ageMs,
    freshness: computeLocalFirstFreshness(ageMs, ttlMs, hardTtlMs),
  }
}

// ── 存储层 ──────────────────────────────────────────────────

function envelopeOf<T>(data: T, schemaVersion: number, updatedAt: number): Envelope<T> {
  return { v: schemaVersion, updatedAt, data }
}

function pickNewer<T>(
  current: LocalFirstRecord<T> | null,
  next: LocalFirstRecord<T> | null,
): LocalFirstRecord<T> | null {
  if (!current) return next
  if (!next) return current
  return next.updatedAt > current.updatedAt ? next : current
}

/**
 * 创建一份数据的本地存储（三层组合）。
 * 除单测外一般不用直接调用 —— localFirst() / readLocalFirstSync() 内部会建。
 */
export function createLocalFirstStore<T>(opts: LocalFirstConfigBase<T>): LocalFirstStore<T> {
  const schemaVersion = opts.schemaVersion ?? LOCAL_FIRST_ENVELOPE_VERSION
  const validate = opts.validate
  const maxEntryBytes = opts.maxEntryBytes

  const readSync = (): LocalFirstRecord<T> | null => {
    if (!isBrowser()) return null
    const key = scopedKey(opts.key)
    const hit = readPersistedCache<unknown>(key, { ttlMs: 0 })
    if (!hit) return null
    const env = parseLocalFirstEnvelope<T>(hit.value, schemaVersion, validate)
    if (!env) {
      // 损坏 / 版本不符：删掉，避免每次首帧都白解析一遍
      dropPersistedCache(key)
      return null
    }
    return { data: env.data, updatedAt: env.updatedAt }
  }

  const read = async (): Promise<LocalFirstRecord<T> | null> => {
    if (!isBrowser()) return null
    const key = scopedKey(opts.key)
    const localRecord = readSync()
    let best = localRecord

    if (isNativePlatform()) {
      const nativeHit = await readOfflineSnapshotValue<unknown>(key).catch(() => null)
      if (nativeHit) {
        const env = parseLocalFirstEnvelope<T>(nativeHit.value, schemaVersion, validate)
        if (env) best = pickNewer(best, { data: env.data, updatedAt: env.updatedAt })
      }
      // 早期首页快照（原始响应，无信封）：只在没有新数据时兜底
      if (!best && opts.legacyNativeKey) {
        const legacy = await readHomeSnapshot<T>().catch(() => null)
        if (legacy && legacy.data != null && (!validate || validate(legacy.data))) {
          best = { data: legacy.data, updatedAt: legacy.savedAt || 0, legacy: true }
        }
      }
    } else if (isWebCacheSupported()) {
      const idbHit = await readWebCache<unknown>(key, { schemaVersion }).catch(() => null)
      if (idbHit) {
        const env = parseLocalFirstEnvelope<T>(idbHit.value, schemaVersion, validate)
        if (env) {
          const record: LocalFirstRecord<T> = { data: env.data, updatedAt: env.updatedAt || idbHit.updatedAt }
          best = pickNewer(best, record)
          // IDB 比同步镜像新（镜像上限 256K 可能被跳过）：回填镜像，下次首帧才能直接命中
          if (best === record && (!localRecord || record.updatedAt > localRecord.updatedAt)) {
            persistSoon(key, envelopeOf(record.data, schemaVersion, record.updatedAt), { maxBytes: maxEntryBytes })
          }
        }
      }
    }

    // 反向补齐：镜像比持久层新（例如持久层写入被拒）→ 补一次，保持两层一致
    if (best && (!localRecord || best.updatedAt > localRecord.updatedAt)) {
      if (isNativePlatform()) {
        void saveOfflineSnapshotValue(key, envelopeOf(best.data, schemaVersion, best.updatedAt))
      } else if (isWebCacheSupported()) {
        void writeWebCache(key, envelopeOf(best.data, schemaVersion, best.updatedAt), { schemaVersion, maxEntryBytes })
      }
    }
    return best
  }

  const write = async (data: T): Promise<void> => {
    if (!isBrowser()) return
    /**
     * 不在这里等账号校准（会往首屏塞一次 /api/me，和 /api/travels 抢带宽）：
     * 作用域校准在首帧之后单独跑，一旦发现「当前账号 ≠ 缓存命名空间」就整层清空并通知页面重取，
     * 所以即使这一笔写进了旧命名空间，也会在一次性清理里被删掉 —— 既不掉帧也不串号。
     */
    const key = scopedKey(opts.key)
    const now = Date.now()
    const envelope = envelopeOf(data, schemaVersion, now)
    persistSoon(key, envelope, { maxBytes: maxEntryBytes })
    if (isNativePlatform()) {
      void saveOfflineSnapshotValue(key, envelope)
      return
    }
    if (isWebCacheSupported()) {
      void writeWebCache(key, envelope, { schemaVersion, maxEntryBytes })
    }
  }

  const remove = async (): Promise<void> => {
    if (!isBrowser()) return
    const key = scopedKey(opts.key)
    dropPersistedCache(key)
    if (isNativePlatform()) {
      await deleteOfflineSnapshot(key).catch(() => {})
      return
    }
    if (isWebCacheSupported()) await deleteWebCache(key).catch(() => {})
  }

  return { key: opts.key, readSync, read, write, remove }
}

// ── 编排 ────────────────────────────────────────────────────

/** 进行中的刷新（同一 key 并发只发一次网络） */
const inflightRefreshes = new Map<string, Promise<unknown>>()
/** 每个 key 上次成功拉到云端的时间（配合最小间隔抑制抖动） */
const lastRefreshAt = new Map<string, number>()

/** 重置进程内刷新状态（切号/登出后必须清，否则新账号会被「刚拉过」短路） */
export function resetLocalFirstRefreshState(): void {
  inflightRefreshes.clear()
  lastRefreshAt.clear()
}

/** 清空本地优先层的全部落盘（账号切换 / 退出登录） */
async function clearLocalFirstStorage(): Promise<void> {
  resetLocalFirstRefreshState()
  if (!isBrowser()) return
  try {
    clearPersistedCache()
  } catch {
    // 忽略：清不掉不影响后续写入（新数据会覆盖）
  }
  if (isNativePlatform()) {
    await deleteOfflineSnapshotsByPrefix(KEY_PREFIX).catch(() => {})
    return
  }
  await clearWebCache().catch(() => {})
}

/**
 * 退出登录 / 切换账号专用：清空本地优先层（三层 + 内存状态）并通知订阅方。
 * **必须**在登出流程里调用（lib/client/logout.ts），否则换账号后新用户会先看到上一个账号
 * 的首页/列表（隐私问题，与 account-scope 对 SQLite 的处理是同一诉求）。
 */
export async function clearLocalFirstCache(): Promise<void> {
  await clearLocalFirstStorage()
  // 作用域标记也要清：否则下次启动仍按旧账号命名空间读（登出后应该回到 anon）
  if (isBrowser()) {
    try {
      window.localStorage.removeItem(ACCOUNT_STORAGE_KEY)
    } catch {
      // 忽略：隐私模式
    }
  }
  scopeCache = null
  // 同一 SPA 会话里「登出 → 换号登录」不一定整页刷新：把校准探针复位，
  // 下一次挂载才会重新向 /api/me 认清当前账号（否则会一直写在 anon 命名空间里）。
  scopeProbe = null
  scopeScheduled = false
  resolvingAccountId = null
  notifyScopeChange('anon')
}

/** 失效一份缓存（写操作成功后调用，三层一起失效） */
export async function invalidateLocalFirst(key: string): Promise<void> {
  const storageKey = scopedKey(key)
  resetKeyRefreshState(storageKey)
  if (!isBrowser()) return
  dropPersistedCache(storageKey)
  if (isNativePlatform()) {
    await deleteOfflineSnapshot(storageKey).catch(() => {})
    return
  }
  if (isWebCacheSupported()) await deleteWebCache(storageKey).catch(() => {})
}

function resetKeyRefreshState(storageKey: string): void {
  inflightRefreshes.delete(storageKey)
  lastRefreshAt.delete(storageKey)
}

async function shouldSkip<T>(
  cfg: LocalFirstConfig<T>,
  hit: LocalFirstSnapshot<T> | null,
  env: LocalFirstEnv,
  storageKey: string,
): Promise<LocalFirstSkipReason> {
  if (cfg.force) return null
  const online = await env.isOnline()
  if (!online) return 'offline'
  if (cfg.respectSaveData !== false && env.isSaveData()) return 'save-data'
  const minInterval = cfg.revalidateMinIntervalMs ?? REVALIDATE_MIN_INTERVAL_MS
  const last = lastRefreshAt.get(storageKey) ?? 0
  // 本地还新鲜 + 刚拉过 → 不打扰（但过期数据必须拉，否则永远看不到新内容）
  if (hit && hit.freshness === 'fresh' && minInterval > 0 && env.now() - last < minInterval) return 'recent'
  return null
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return '网络错误，请稍后重试'
}

/**
 * 后台刷新编排（导出供单测注入 store/env）。
 * **永不 reject**：所有失败都转成 error/offline 字段，让调用方的 UI 逻辑保持简单。
 */
export async function runLocalFirstRefresh<T>(
  cfg: LocalFirstConfig<T>,
  store: LocalFirstStore<T>,
  hit: LocalFirstSnapshot<T> | null,
  env: LocalFirstEnv = DEFAULT_ENV,
): Promise<LocalFirstRefreshResult<T>> {
  const storageKey = scopedKey(cfg.key)
  const existing = inflightRefreshes.get(storageKey)
  if (existing) return existing as Promise<LocalFirstRefreshResult<T>>

  /**
   * 注意：promise 必须**同步登记**到 inflightRefreshes（不能等 shouldSkip 的 await 之后再登记），
   * 否则同一 tick 里的两次调用（StrictMode 双挂载 / 下拉刷新撞页面切换）会各发一次网络。
   * 因此把「要不要跳过」也放进 promise 内部；跳过的结果对并发调用方共享是安全的（同 key 同环境），
   * 但**跳过结束必须释放登记**，否则后面的 force 刷新会拿到这个「跳过」的旧结果（永远刷不动）。
   */
  let promise: Promise<LocalFirstRefreshResult<T>> | null = null
  const release = () => {
    if (promise && inflightRefreshes.get(storageKey) === promise) inflightRefreshes.delete(storageKey)
  }
  const run = async (): Promise<LocalFirstRefreshResult<T>> => {
    try {
      const skipReason = await shouldSkip(cfg, hit, env, storageKey)
      if (skipReason) {
        return {
          data: hit?.data ?? null,
          source: hit ? 'local' : 'none',
          error: hit ? '' : skipReason === 'offline' ? '当前处于离线状态，暂无本地内容' : '已省流量模式：下拉刷新可立即更新',
          offline: skipReason === 'offline',
          skipped: true,
          skipReason,
          hit,
        }
      }
      const remote = await cfg.fetchRemote()
      if (cfg.validate && !cfg.validate(remote)) {
        // 云端返回了不符合契约的数据：保留本地旧数据，绝不用它覆盖缓存
        return {
          data: hit?.data ?? null,
          source: hit ? 'local' : 'none',
          error: '数据格式校验失败，已保留本地缓存',
          offline: false,
          skipped: false,
          skipReason: null,
          hit,
        }
      }
      await store.write(remote)
      lastRefreshAt.set(storageKey, env.now())
      return { data: remote, source: 'remote', error: '', offline: false, skipped: false, skipReason: null, hit: null }
    } catch (error) {
      if (isSessionExpiredError(error)) {
        // 401：本地缓存属于上一个会话，先清（隐私），再交给页面跳登录
        await store.remove()
        resetKeyRefreshState(storageKey)
        return {
          data: null,
          source: 'none',
          error: '登录状态已失效，请重新登录',
          offline: false,
          skipped: false,
          skipReason: null,
          hit: null,
        }
      }
      // 网络失败：退回本地（哪怕已过 hardTtl —— 能看旧内容也好过空白）
      let fallback = hit
      if (!fallback) {
        const record = await store.read().catch(() => null)
        fallback = record ? toSnapshot(record, cfg.ttlMs, cfg.hardTtlMs) : null
      }
      if (fallback) {
        return {
          data: fallback.data,
          source: 'local',
          error: '',
          offline: true,
          skipped: false,
          skipReason: null,
          hit: fallback,
        }
      }
      return {
        data: null,
        source: 'none',
        error: errorMessage(error),
        offline: true,
        skipped: false,
        skipReason: null,
        hit: null,
      }
    } finally {
      release()
    }
  }

  promise = run()
  inflightRefreshes.set(storageKey, promise)
  return promise
}

/**
 * 本地优先取数（页面入口）。
 *
 * 用法（在 layout effect 里，不要放进 useState 初始化器 —— 否则与服务端 HTML 不一致）：
 *   const prepare = await localFirst({ key, ttlMs, hardTtlMs, fetchRemote })
 *   if (prepare.hit) setData(prepare.hit.data)   // 首屏直接出内容
 *   const result = await prepare.refresh         // 后台对齐（或首屏取数）
 *   if (result.data) setData(result.data)
 *
 * hit 为 null 时表示没有可用本地数据，页面走原来的骨架屏流程。
 */
export async function localFirst<T>(cfg: LocalFirstConfig<T>): Promise<LocalFirstPrepare<T>> {
  const store = createLocalFirstStore(cfg)
  const record = await store.read().catch(() => null)
  const hit = record ? toSnapshot(record, cfg.ttlMs, cfg.hardTtlMs) : null
  const refresh = runLocalFirstRefresh(cfg, store, hit)
  return { hit, refresh }
}

/**
 * 同步读本地（首帧同步出内容的关键）。只读 localStorage 镜像 —— 不能是异步，
 * 否则浏览器已经画完骨架屏了。没有镜像时返回 null，页面按原来的 loading 流程走。
 */
export function readLocalFirstSync<T>(cfg: LocalFirstConfigBase<T>): LocalFirstSnapshot<T> | null {
  const record = createLocalFirstStore(cfg).readSync()
  if (!record) return null
  return toSnapshot(record, cfg.ttlMs, cfg.hardTtlMs)
}

/** 诊断：本地优先层当前状态（缓存条数/字节、作用域、省流量、是否支持 IDB） */
export async function inspectLocalFirstCache(): Promise<{
  scope: LocalFirstScope
  saveData: boolean
  indexedDB: { supported: boolean; entries: number; bytes: number }
  mirrorKeys: string[]
}> {
  const stats = await webCacheStats()
  const mirrorKeys: string[] = []
  if (isBrowser()) {
    try {
      const ls = window.localStorage
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i)
        if (!key) continue
        if (key.indexOf('tn:pc:') === 0) mirrorKeys.push(key)
      }
    } catch {
      // 忽略：隐私模式下读不到
    }
  }
  return {
    scope: getLocalFirstScope(),
    saveData: isSaveDataEnabled(),
    indexedDB: stats,
    mirrorKeys,
  }
}
