'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { isNativePlatform } from '@/lib/modules/offline/platform'
import {
  localMediaCacheKey,
  resolveLocalMediaHitsByIds,
  resolveLocalMediaHitsByRemote,
  toLocalMediaRef,
  type LocalMediaPrefer,
  type LocalMediaRef,
  type LocalMediaUriHit,
} from '@/lib/modules/offline/media'

/**
 * 媒体地址本地化 hook（P4 · 读取侧本地优先）。
 *
 * 契约：
 *  · **原生端**：优先返回本地文件地址（Filesystem 的 file:// 经 Capacitor.convertFileSrc
 *    换成 WebView 可加载的 http://localhost/_capacitor_file_/…），本地没有才用远端 URL；
 *  · **Web 端**：恒返回远端 URL（Web 没有 Capacitor 文件系统，也不该多查一次库）；
 *  · 入参可以是 mediaId（最准，**离线新建、尚未上传、remoteUrl 为 NULL 的照片只有它管用**）
 *    或 remoteUrl（拿不到 mediaId 的相册封面/照片墙），也可以两个都给（mediaId 优先）；
 *  · 命中的地址缓存在模块级 Map 里，列表虚拟滚动/切页重挂载不会重复查库；
 *  · 同一帧内多个组件发起解析时**合并成一次批量 SQL**（避免 N+1）。
 *
 * 为什么解析要「延迟一帧」：<img> 一旦拿到远端地址就会立刻发请求，而本地文件往往几毫秒
 * 就能查到；先发远端请求再换成本地文件，等于白花流量 + 一次可见的闪图。合并队列用 16ms
 * （一帧）为窗口，既能让同一屏的图凑成一次查询，又不会让人感觉到延迟。
 */

export type { LocalMediaRef, LocalMediaPrefer }

/** 入参也接受裸值：number 视为 mediaId，string 视为 remoteUrl（兼容旧调用） */
export type LocalMediaInput = LocalMediaRef | number | string | null | undefined

export type LocalMediaSourceKind = 'local' | 'remote' | 'pending'

/** 缓存 / 解析结果：地址 + 是否降级到 320px 缩略图 */
interface LocalUriEntry {
  uri: string
  viaThumb: boolean
}

export interface LocalMediaSource {
  /** 应该渲染到 <img src> 的地址；解析中为空串 */
  url: string
  /** local = 本地文件；remote = 远端 URL；pending = 原生端正在查本地文件（别急着请求远端） */
  source: LocalMediaSourceKind
  /**
   * 本地命中的是「320px 缩略图」而调用方想要原图（上传成功后原图已被删）。
   * 调用方据此决定：在线时宁可走远端高清，离线时才接受这张小图。
   */
  viaThumb: boolean
  /** 本地文件加载失败时调用：本会话不再尝试这张图的本地文件（下次直接远端） */
  invalidate: () => void
}

const NO_LOCAL: LocalUriEntry = { uri: '', viaThumb: false }

/** key → 命中结果（'' 表示「确认没有本地文件 / 已失效」，用于避免重复查库） */
const LOCAL_URI_CACHE = new Map<string, LocalUriEntry>()

interface PendingRequest {
  key: string
  ref: LocalMediaRef
  prefer: LocalMediaPrefer
}

/** 待合并的解析请求（同一帧内收集，flush 时一次批量查询） */
const PENDING = new Map<string, PendingRequest>()
/** key → 等待结果的回调（同一 key 并发合流） */
const WAITERS = new Map<string, Array<(entry: LocalUriEntry) => void>>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
/** 合并窗口：一帧。太短凑不齐同屏图，太长会让人感到延迟 */
const FLUSH_DELAY_MS = 16

/** 读缓存（undefined = 还没查过） */
export function peekLocalMediaCache(input: LocalMediaInput, prefer: LocalMediaPrefer = 'original'): string | undefined {
  const key = localMediaCacheKey(toLocalMediaRef(input), prefer)
  return key ? LOCAL_URI_CACHE.get(key)?.uri : undefined
}

/** 作废某张图的本地缓存（本地文件被 LRU 删掉 / 加载失败时调用） */
export function forgetLocalMedia(input: LocalMediaInput, prefer: LocalMediaPrefer = 'original'): void {
  const key = localMediaCacheKey(toLocalMediaRef(input), prefer)
  if (key) LOCAL_URI_CACHE.set(key, NO_LOCAL)
}

/**
 * 解析单张图的本地地址（带缓存 + 同帧合并）。
 * 原生端以外恒返回「无命中」（调用方保持远端 URL，不会多一次查询）。
 */
export function resolveLocalMediaUriQueued(
  input: LocalMediaInput,
  prefer: LocalMediaPrefer = 'original',
): Promise<LocalUriEntry> {
  const ref = toLocalMediaRef(input)
  const key = localMediaCacheKey(ref, prefer)
  if (!ref || !key) return Promise.resolve(NO_LOCAL)
  if (!isNativePlatform()) return Promise.resolve(NO_LOCAL)
  const cached = LOCAL_URI_CACHE.get(key)
  if (cached !== undefined) return Promise.resolve(cached)

  const waiting = WAITERS.get(key)
  if (waiting) return new Promise<LocalUriEntry>((resolve) => waiting.push(resolve))
  return new Promise<LocalUriEntry>((resolve) => {
    WAITERS.set(key, [resolve])
    PENDING.set(key, { key, ref, prefer })
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null
        void flushPendingRequests()
      }, FLUSH_DELAY_MS)
    }
  })
}

/** 把这一帧收集到的请求按「mediaId / remoteUrl × 偏好」分组，各发一次批量查询 */
async function flushPendingRequests(): Promise<void> {
  const batch = Array.from(PENDING.values())
  PENDING.clear()
  const results = new Map<string, LocalUriEntry>()

  const groups = new Map<string, PendingRequest[]>()
  for (const request of batch) {
    const groupKey = (request.ref.mediaId ? 'id' : 'url') + '#' + request.prefer
    const list = groups.get(groupKey)
    if (list) list.push(request)
    else groups.set(groupKey, [request])
  }

  await Promise.all(
    Array.from(groups.entries()).map(async ([groupKey, requests]) => {
      const prefer = requests[0].prefer
      try {
        if (groupKey.startsWith('id#')) {
          const ids = requests.map((request) => String(request.ref.mediaId))
          const byId = await resolveLocalMediaHitsByIds(ids, prefer)
          for (const request of requests) results.set(request.key, byId[String(request.ref.mediaId)] ?? NO_LOCAL)
        } else {
          const urls = requests.map((request) => String(request.ref.remoteUrl))
          const byUrl = await resolveLocalMediaHitsByRemote(urls, prefer)
          for (const request of requests) results.set(request.key, byUrl[String(request.ref.remoteUrl)] ?? NO_LOCAL)
        }
      } catch {
        for (const request of requests) results.set(request.key, NO_LOCAL)
      }
    }),
  )

  for (const request of batch) {
    const entry = results.get(request.key) ?? NO_LOCAL
    LOCAL_URI_CACHE.set(request.key, entry)
    const callbacks = WAITERS.get(request.key)
    WAITERS.delete(request.key)
    for (const callback of callbacks ?? []) callback(entry)
  }
}

/**
 * 是否已完成水合。
 *
 * 为什么需要它：服务端渲染时 isNativePlatform() 恒为 false（没有 window），
 * 客户端原生壳里是 true。若首帧就按平台分支渲染，SSR/静态导出的 HTML 与客户端
 * 首帧不一致 → React 水合告警 + 整棵树重渲染。用 useSyncExternalStore 的
 * getServerSnapshot 拿到「水合前后」的确定值：服务端与水合首帧 = false（按远端渲染，
 * 与服务端 HTML 一致），水合之后 = true（才启用本地优先）。
 */
const subscribeNoop = () => () => {}
function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false)
}

/**
 * 单张图：返回渲染地址、来源与「是否降级缩略图」。
 * 原生端在查本地文件期间 source = 'pending'、url 为空 —— 调用方此时**不要渲染远端**
 * （否则会先发一个远端请求再被本地替换，弱网/离线就是一次可见的闪白）。
 */
export function useLocalMediaSource(
  input: LocalMediaInput,
  options?: { prefer?: LocalMediaPrefer },
): LocalMediaSource {
  const prefer: LocalMediaPrefer = options?.prefer ?? 'original'
  const hydrated = useHydrated()
  const native = hydrated && isNativePlatform()
  const ref = toLocalMediaRef(input)
  const key = localMediaCacheKey(ref, prefer)
  const remoteUrl = ref?.remoteUrl ?? ''

  /** 已经解析出结果的那个 key 与命中项（key 不匹配时不采用，避免切图时串味） */
  const [resolved, setResolved] = useState<{ key: string; entry: LocalUriEntry } | null>(null)
  /** 解析期间变化的最新入参（effect 里读它，避免把对象放进依赖导致每帧重查） */
  const inputRef = useRef(input)
  inputRef.current = input

  useEffect(() => {
    if (!native || !key) return
    const cached = LOCAL_URI_CACHE.get(key)
    if (cached !== undefined) {
      setResolved({ key, entry: cached })
      return
    }
    let alive = true
    resolveLocalMediaUriQueued(inputRef.current, prefer).then((entry) => {
      if (alive) setResolved({ key, entry })
    })
    return () => {
      alive = false
    }
  }, [native, key, prefer])

  const invalidate = useCallback(() => {
    if (!key) return
    LOCAL_URI_CACHE.set(key, NO_LOCAL)
    setResolved({ key, entry: NO_LOCAL })
  }, [key])

  if (!native || !key) return { url: remoteUrl, source: 'remote', viaThumb: false, invalidate }
  if (resolved && resolved.key === key) {
    return resolved.entry.uri
      ? { url: resolved.entry.uri, source: 'local', viaThumb: resolved.entry.viaThumb, invalidate }
      : { url: remoteUrl, source: 'remote', viaThumb: false, invalidate }
  }
  return { url: '', source: 'pending', viaThumb: false, invalidate }
}

/**
 * 本地命中「是否该真的用它」。
 *
 * 规则：想要大图（预览/大图/画册整页）却只命中 320px 缩略图时，
 *  · 在线 → 用远端高清（缩略图放大会糊，画质回归比省一次请求更糟）；
 *  · 离线 / 本来就没有远端地址（尚未上传的照片）→ 小图也总比白屏强。
 * 纯函数，便于单测；组件也统一用它，不在各处复制粘贴判断。
 */
export function isLocalMediaUsable(
  source: LocalMediaSource,
  options: { wantsLarge?: boolean; hasRemote?: boolean; online?: boolean } = {},
): boolean {
  if (source.source !== 'local' || !source.url) return false
  if (options.wantsLarge !== true || !source.viaThumb) return true
  const online = options.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine !== false)
  return !online || options.hasRemote === false
}

/** 便捷版：只要地址（大多数调用方只用这个） */
export function useLocalMediaUrl(input: LocalMediaInput, options?: { prefer?: LocalMediaPrefer }): string {
  return useLocalMediaSource(input, options).url
}

/** 把「id / url 列表」归一成一个稳定签名，供依赖数组使用 */
function useKeysSignature(values: (string | number | null | undefined)[]): string {
  return useMemo(() => {
    const seen = new Set<string>()
    const keys: string[] = []
    for (const value of values) {
      if (value == null) continue
      const key = String(value).trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      keys.push(key)
    }
    return keys.join('\n')
  }, [values])
}

/** 批量解析的共用实现（按 id 或 url 二选一），返回命中映射 */
function useBatchLocalMedia(
  keys: (string | number | null | undefined)[],
  kind: 'id' | 'url',
  prefer: LocalMediaPrefer,
): Record<string, string> {
  const hydrated = useHydrated()
  const native = hydrated && isNativePlatform()
  const signature = useKeysSignature(keys)
  const list = useMemo(() => (signature ? signature.split('\n') : []), [signature])
  const [map, setMap] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!native || list.length === 0) {
      setMap({})
      return
    }
    // 缓存优先：已经查过的条目直接用，不再查库
    const next: Record<string, string> = {}
    const missing: string[] = []
    for (const key of list) {
      const ref: LocalMediaRef = kind === 'id' ? { mediaId: key } : { remoteUrl: key }
      const cached = LOCAL_URI_CACHE.get(localMediaCacheKey(ref, prefer))
      if (cached !== undefined) {
        if (cached.uri) next[key] = cached.uri
      } else {
        missing.push(key)
      }
    }
    setMap(next)
    if (missing.length === 0) return
    let alive = true
    const run = kind === 'id'
      ? resolveLocalMediaHitsByIds(missing, prefer)
      : resolveLocalMediaHitsByRemote(missing, prefer)
    run.then((hits: Record<string, LocalMediaUriHit>) => {
      if (!alive) return
      const patch: Record<string, string> = {}
      for (const key of missing) {
        const entry: LocalUriEntry = hits[key] ?? NO_LOCAL
        const ref: LocalMediaRef = kind === 'id' ? { mediaId: key } : { remoteUrl: key }
        LOCAL_URI_CACHE.set(localMediaCacheKey(ref, prefer), entry)
        if (entry.uri) patch[key] = entry.uri
      }
      setMap((prev) => ({ ...prev, ...patch }))
    }).catch(() => {
      // 解析失败一律按「没有本地文件」处理（调用方保持远端 URL），绝不冒泡成页面错误
    })
    return () => {
      alive = false
    }
  }, [native, prefer, list, kind])

  return map
}

/**
 * 批量（按远端 URL）：输出「远端 URL → 本地地址」映射，只含命中项。
 * 一次 SQL 查完整批（内部 IN 批量），Web 端恒为空对象。
 */
export function useLocalMediaUrls(
  urls: (string | null | undefined)[],
  options?: { prefer?: LocalMediaPrefer },
): Record<string, string> {
  return useBatchLocalMedia(urls, 'url', options?.prefer ?? 'original')
}

/**
 * 批量（按 mediaId）：输出「mediaId → 本地地址」映射，只含命中项。
 * 离线新建、尚未上传（remoteUrl 为空）的照片就靠它显示。
 */
export function useLocalMediaUrlsById(
  mediaIds: (number | string | null | undefined)[],
  options?: { prefer?: LocalMediaPrefer },
): Record<string, string> {
  return useBatchLocalMedia(mediaIds, 'id', options?.prefer ?? 'original')
}

/* ------------------------- 测试辅助（不参与业务逻辑） ------------------------- */

/** 清空模块级缓存与合并队列（单测用；避免用例互相污染） */
export function __resetLocalMediaCacheForTest(): void {
  LOCAL_URI_CACHE.clear()
  PENDING.clear()
  WAITERS.clear()
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = null
}

/** 当前缓存条数（单测断言「没有重复查库」用） */
export function __localMediaCacheSizeForTest(): number {
  return LOCAL_URI_CACHE.size
}
