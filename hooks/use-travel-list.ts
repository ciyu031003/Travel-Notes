'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiUrl } from '@/lib/api-base'
import { readWithFallback } from '@/lib/modules/offline/repository'
import {
  mergeLocalTravelsIntoRemote,
  readAllLocalTravels,
  readLocalTravels,
} from '@/lib/modules/offline/travel-read'
import {
  ensureLocalFirstScope,
  invalidateLocalFirst,
  localFirst,
  onLocalFirstScopeChange,
  readLocalFirstSync,
  scheduleLocalFirstScopeCheck,
  type LocalFirstConfigBase,
} from '@/lib/modules/offline/local-first'
import { onNetworkChange } from '@/lib/modules/offline/native/network'
import { useIsomorphicLayoutEffect } from '@/lib/client/persisted-cache'

export interface TravelListItem {
  slug?: string
  cover?: string
  images?: string[]
  title?: string
  [key: string]: unknown
}

export interface UseTravelListResult {
  /** null = 还没取到（加载中）；空数组 = 确认为空 */
  posts: TravelListItem[] | null
  error: string
  /** 数据来自本地离线库（远端不可达）——UI 据此显示离线横幅 */
  offline: boolean
  /** 后台正在校准（已有内容在显示，仅供「更新中」这类轻提示用） */
  revalidating: boolean
  /** 首屏数据来自本地缓存（尚未被网络校准） */
  fromCache: boolean
  reload: () => Promise<void>
}

/**
 * 旅行列表的共享数据层（P-13 跨端收敛；P1 接入本地优先读取层）。
 *
 * 数据链路（由近到远，命中前面就不等后面）：
 *  · **localStorage 同步镜像**：挂载第一帧同步读（readLocalFirstSync），冷却/切 tab 回来立刻有内容；
 *  · **IndexedDB / SQLite 快照**：异步读，取最新的一份（Web 端 IDB，原生端 home_snapshot）；
 *  · **远端**：在线时拉 /api/travels，并把「本地待同步」的旅行合并进来（见 mergeLocalTravelsIntoRemote）；
 *  · **离线兜底**：原生端 readWithFallback 回退 SQLite travel 表，Web 端由 local-first 回退缓存。
 *
 * 何时拉远端（校验机制，见 lib/modules/offline/local-first.ts）：
 *  · 本地新鲜（< 60s）→ 先渲染，仍后台静默校准（5s 内不重复发）；
 *  · 本地陈旧（< 24h）→ 先渲染 + 后台拉，标记 revalidating（不闪骨架、不白屏）；
 *  · 无本地 / 超过 24h / 校验失败 → 等待网络（页面骨架屏），失败再退回本地并标记 offline；
 *  · 下拉刷新 / 显式重试 → force，强制走网络；
 *  · 离线 / 省流量 → 不发后台请求，只用本地。
 * 账号隔离：缓存 key 带账号作用域，切号时 local-first 会清空旧命名空间并通知这里重取。
 */
/** 软新鲜期：1 分钟内重复打开直接读本地（后台仍校准一次） */
const TTL_MS = 60_000
/** 硬新鲜期：超过它就必须等网络（失败仍回退本地） */
const HARD_TTL_MS = 24 * 60 * 60 * 1000
/** 缓存结构版本：posts 形状变更时 +1，旧缓存自动失效 */
const CACHE_SCHEMA_VERSION = 1

/** 缓存声明（key 直接沿用接口 path，便于排查） */
export const TRAVEL_LIST_CACHE_CONFIG: LocalFirstConfigBase<TravelListItem[]> = {
  key: '/api/travels',
  ttlMs: TTL_MS,
  hardTtlMs: HARD_TTL_MS,
  schemaVersion: CACHE_SCHEMA_VERSION,
  validate: (value): value is TravelListItem[] =>
    Array.isArray(value) && value.every((item) => item != null && typeof item === 'object'),
}

type TravelListSnapshot = {
  posts: TravelListItem[]
  offline: boolean
  at: number
}

let snapshot: TravelListSnapshot | null = null
let inflight: Promise<TravelListItem[]> | null = null
/** 最近一次取数的离线判定（local-first 只关心数据，离线标记由这里带出来） */
let lastFetchOffline = false

/** 仅测试/调试用：清空内存快照 */
export function __resetTravelListSnapshot(): void {
  snapshot = null
  inflight = null
  lastFetchOffline = false
}

/**
 * 写操作（新建旅行等）成功后主动失效快照。
 * 三层一起失效（内存 / localStorage 镜像 / IDB·SQLite），否则「新建 → 进详情 → 返回列表」
 * 会命中旧快照，用户看到列表里没有刚建的那本；重启 App 后同样会看到旧列表。
 */
export function invalidateTravelListSnapshot(): void {
  snapshot = null
  inflight = null
  void invalidateLocalFirst(TRAVEL_LIST_CACHE_CONFIG.key)
}

/**
 * 真正的网络取数（含原生端 SQLite 兜底 + 本地待同步合并）。
 * 并发去重放在这里：同一时刻多次 reload（StrictMode 双执行、下拉刷新撞页面切换）只发一次。
 */
function fetchTravelListRemote(): Promise<TravelListItem[]> {
  if (inflight) return inflight
  const p = (async () => {
    const result = await readWithFallback<TravelListItem[]>(
      async () => {
        const res = await fetch(apiUrl('/api/travels'), { credentials: 'include', cache: 'no-cache' })
        if (!res.ok) throw new Error('http ' + res.status)
        const j = await res.json()
        if (j && j.error) throw new Error(String(j.error))
        const remote = (j?.posts || []) as TravelListItem[]
        // 【关键】在线时也要把「本地待同步」的旅行合并进来（合并逻辑见 mergeLocalTravelsIntoRemote）
        const local = await readAllLocalTravels()
        return mergeLocalTravelsIntoRemote(remote as Record<string, unknown>[], local) as TravelListItem[]
      },
      async () => {
        const local = await readLocalTravels()
        return (local as TravelListItem[] | null) ?? []
      },
    )
    lastFetchOffline = result.source === 'local'
    return result.data
  })().finally(() => {
    inflight = null
  })
  inflight = p
  return p
}

export function useTravelList(): UseTravelListResult {
  // 初始状态只读模块快照：客户端切页时即时命中；硬加载（水合）时内存为空 → 与服务端一致
  const [posts, setPosts] = useState<TravelListItem[] | null>(() => snapshot?.posts ?? null)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(() => snapshot?.offline ?? false)
  const [revalidating, setRevalidating] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const aliveRef = useRef(true)
  const requestIdRef = useRef(0)
  /** 与 state 同步的最近列表：失败分支据此判断「要不要报错」 */
  const postsRef = useRef<TravelListItem[] | null>(posts)

  const apply = useCallback((next: TravelListItem[] | null) => {
    postsRef.current = next
    setPosts(next)
  }, [])

  /**
   * 一轮本地优先取数：先读本地（命中即渲染），再后台对齐云端。
   * @param force 跳过「刚拉过」的抑制（下拉刷新 / 显式重试）
   * @param silent 不进入 revalidating 态（聚焦/联网等背景校准）
   */
  const begin = useCallback(
    async (opts: { force?: boolean; silent?: boolean } = {}) => {
      const requestId = ++requestIdRef.current
      if (!opts.silent && postsRef.current != null) setRevalidating(true)
      try {
        const prepare = await localFirst({
          ...TRAVEL_LIST_CACHE_CONFIG,
          fetchRemote: fetchTravelListRemote,
          force: opts.force === true,
        })
        if (!aliveRef.current || requestId !== requestIdRef.current) return

        // ① 本地命中且未超硬新鲜期：立刻出内容（不转圈），并显示轻提示
        if (prepare.hit && prepare.hit.freshness !== 'expired') {
          apply(prepare.hit.data)
          setFromCache(true)
          setError('')
          if (prepare.hit.freshness === 'stale') setRevalidating(true)
        }

        // ② 后台 / 前台刷新（local-first 内部已处理离线、省流量、并发去重、401 清缓存）
        const result = await prepare.refresh
        if (!aliveRef.current || requestId !== requestIdRef.current) return

        if (result.data) {
          apply(result.data)
          setError('')
          setFromCache(result.skipped === true && prepare.hit != null)
        } else if (result.error) {
          // 没有任何本地内容时才报错（有内容时一次网络失败不该把用户打回错误页）
          setError(result.error)
        }
        /**
         * 离线标记只看「真的连不上」：
         *  · result.offline = 拉取失败后回退本地（local-first 判定）；
         *  · lastFetchOffline = 原生端 readWithFallback 回退到 SQLite 表。
         * 省流量模式（skipped/save-data）**不算离线** —— 用户主动关掉了自动拉取，
         * 这时挂「离线模式」横幅是误导。
         */
        const nextOffline = result.offline || lastFetchOffline
        setOffline(nextOffline)
        if (result.data && !nextOffline) setFromCache(false)
      } catch {
        if (!aliveRef.current || requestId !== requestIdRef.current) return
        if (postsRef.current) return
        setError('网络错误，请稍后重试')
      } finally {
        if (aliveRef.current && requestId === requestIdRef.current) setRevalidating(false)
      }
    },
    [apply],
  )

  const reload = useCallback(async () => {
    await begin({ force: true, silent: true })
  }, [begin])

  /**
   * 水合后、首次绘制前：同步读本地镜像（首帧就渲染上次的列表）。
   * 必须放在 layout effect 里（不能进 useState 初始化器），否则与服务端 HTML 不一致。
   * 硬新鲜期以上的数据不参与首帧（按需求走网络 + 骨架屏），失败时仍会回退它。
   */
  useIsomorphicLayoutEffect(() => {
    if (snapshot) return
    const local = readLocalFirstSync(TRAVEL_LIST_CACHE_CONFIG)
    if (!local || local.freshness === 'expired') return
    snapshot = { posts: local.data, offline: false, at: local.updatedAt }
    apply(local.data)
    setFromCache(true)
    if (local.freshness === 'stale') setRevalidating(true)
  }, [apply])

  useEffect(() => {
    aliveRef.current = true
    // 首帧之后校准账号作用域（切号时清旧缓存并通知下面那个订阅）
    scheduleLocalFirstScopeCheck()
    void ensureLocalFirstScope()
    if (snapshot) {
      apply(snapshot.posts)
      setOffline(snapshot.offline)
    }
    void begin()
    return () => {
      aliveRef.current = false
    }
  }, [apply, begin])

  // 网络恢复：后台补一次（离线时 local-first 不会发请求，所以这里只处理「恢复」）
  useEffect(() => {
    let disposed = false
    let off: (() => void) | null = null
    void onNetworkChange((state) => {
      if (disposed) return
      if (!state.connected) {
        setOffline(true)
        return
      }
      void begin({ silent: true })
    })
      .then((fn) => {
        if (disposed) fn()
        else off = fn
      })
      .catch(() => {})
    return () => {
      disposed = true
      off?.()
    }
  }, [begin])

  // 切号 / 退出登录：旧账号的内容必须立刻丢弃（隐私），再用新作用域重取
  useEffect(() => {
    return onLocalFirstScopeChange(() => {
      snapshot = null
      lastFetchOffline = false
      apply(null)
      setOffline(false)
      setFromCache(false)
      setError('')
      void begin({ force: true, silent: true })
    })
  }, [apply, begin])

  return { posts, error, offline, revalidating, fromCache, reload }
}
