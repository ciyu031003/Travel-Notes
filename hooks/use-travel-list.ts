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
  PERSISTED_TTL_MS,
  dropPersistedCache,
  persistSoon,
  readPersistedCache,
  useIsomorphicLayoutEffect,
} from '@/lib/client/persisted-cache'

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
  reload: () => Promise<void>
}

/**
 * 旅行列表的共享数据层（P-13 跨端收敛；移动端性能专项 D 加入快照；E1 加入落盘水合）。
 *
 * 为什么抽出来：Web 与 App 的列表页共用「远端优先 + 本地兜底 + 待同步合并」这一条
 * 数据链路（离线新建的旅行必须出现在列表里，否则用户建完回列表看不到它——真机反馈过）。
 * 取数、合并、离线判定收口在一处后，桌面/移动两棵树只负责「怎么渲染」，
 * 新增入口（如未来的搜索落地页）直接复用，不再复制 fetch + merge 逻辑。
 *
 * 三层缓存（由近到远）：
 *  · **模块级内存快照**：本次进程内 /travel ⇄ 别的 tab 来回切，同步命中、不闪 loading；
 *  · **localStorage 持久化快照**（E1）：冷/热启动后进程内存是空的，这里让挂载第一帧就能
 *    渲染上次的列表（移动静态壳没有服务端直出，否则打开 App 只能先看骨架屏）；
 *  · 命中任一层都**不跳过后台刷新**：先渲染再对齐，避免「刚建的旅行 5 秒内回列表看不见」。
 * 并发去重：同一时刻多次 reload（StrictMode 双执行、下拉刷新 + 页面切换）合并为一次。
 */
/**
 * 「新鲜期」只决定**是否跳过后台刷新**，不再决定是否渲染快照。
 *
 * 曾经的实现是 30s 内直接 return（连后台刷新都不发）—— 首帧确实快，但
 * 新建/编辑旅行后在 30s 内回到列表会看到旧数据（「刚建的那本不见了」）。
 * 现在：有快照就**先渲染**（首帧依旧 instantly），然后在后台对齐一次；
 * 5s 内连续切换（tab 来回点）不重复请求。
 */
const SNAPSHOT_FRESH_MS = 5_000

/** 持久化快照的 key（与 useApi 的约定一致：直接用接口 path 当 key） */
const PERSIST_KEY = '/api/travels'

type TravelListSnapshot = {
  posts: TravelListItem[]
  offline: boolean
  at: number
}

let snapshot: TravelListSnapshot | null = null
let inflight: Promise<TravelListSnapshot> | null = null

/** 仅测试/调试用：清空内存快照 */
export function __resetTravelListSnapshot(): void {
  snapshot = null
  inflight = null
}

/**
 * 读持久化快照。
 *
 * offline 不落盘：那是「上一次进程里远端不可达」的瞬时判断，重启/换网后没有意义，
 * 水合出来的数据一律按在线处理，真正的离线态由本轮刷新结果决定。
 */
function readPersistedSnapshot(): TravelListSnapshot | null {
  const hit = readPersistedCache<TravelListItem[]>(PERSIST_KEY, { ttlMs: PERSISTED_TTL_MS })
  if (!hit || !Array.isArray(hit.value)) return null
  return { posts: hit.value, offline: false, at: hit.at }
}

/**
 * 写操作（新建旅行等）成功后主动失效快照。
 * 不失效的话，创建流程「新建 → 进详情 → 返回列表」会在 5s 内命中旧快照，
 * 用户看到列表里没有刚建的那本；E1 起连 localStorage 里那份一起清掉，
 * 否则重启 App 后又看到旧列表。
 */
export function invalidateTravelListSnapshot(): void {
  snapshot = null
  dropPersistedCache(PERSIST_KEY)
}

async function fetchTravelList(): Promise<TravelListSnapshot> {
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
  return { posts: result.data, offline: result.source === 'local', at: Date.now() }
}

/** 共享取数：并发调用合并为一次（同时覆盖「页面切换」与「下拉刷新」撞车） */
function loadShared(): Promise<TravelListSnapshot> {
  if (inflight) return inflight
  const p = fetchTravelList()
    .then((next) => {
      snapshot = next
      // 落盘推迟到下一帧之后：列表可能有几十条带封面，序列化不该卡在渲染那一帧
      persistSoon(PERSIST_KEY, next.posts)
      return next
    })
    .finally(() => {
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
  const aliveRef = useRef(true)
  /** 与 state 同步的最近列表：失败分支据此判断「要不要报错」 */
  const postsRef = useRef<TravelListItem[] | null>(posts)

  const apply = useCallback((next: TravelListItem[] | null) => {
    postsRef.current = next
    setPosts(next)
  }, [])

  const reload = useCallback(async () => {
    try {
      const next = await loadShared()
      if (!aliveRef.current) return
      setPosts(next.posts)
      setOffline(next.offline)
      setError('')
    } catch {
      if (!aliveRef.current) return
      // 已有本地内容时不要让一次网络失败清空列表（本地优先）；没内容才报错
      if (postsRef.current) return
      setError('网络错误，请稍后重试')
    }
  }, [])

  /**
   * 水合后、首次绘制前：内存没有快照就读 localStorage 的那份。
   * 这是「冷启动/热启动立刻有内容」的关键——挂载第一帧就渲染上次的列表。
   * 必须放在 layout effect 里（不能进 useState 初始化器），否则与服务端 HTML 不一致。
   */
  useIsomorphicLayoutEffect(() => {
    if (snapshot) return
    const persisted = readPersistedSnapshot()
    if (!persisted) return
    snapshot = persisted
    apply(persisted.posts)
    setOffline(persisted.offline)
  }, [apply])

  useEffect(() => {
    aliveRef.current = true
    const hit = snapshot
    if (hit) {
      // 有快照：先同步渲染（不闪 loading / 不白屏），再按新鲜期决定是否后台对齐
      apply(hit.posts)
      setOffline(hit.offline)
      if (Date.now() - hit.at >= SNAPSHOT_FRESH_MS) void reload()
    } else {
      void reload()
    }
    return () => {
      aliveRef.current = false
    }
  }, [reload, apply])

  return { posts, error, offline, reload }
}
