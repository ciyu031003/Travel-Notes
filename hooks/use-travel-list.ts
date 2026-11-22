'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiUrl } from '@/lib/api-base'
import { readWithFallback } from '@/lib/modules/offline/repository'
import {
  mergeLocalTravelsIntoRemote,
  readAllLocalTravels,
  readLocalTravels,
} from '@/lib/modules/offline/travel-read'

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
 * 旅行列表的共享数据层（P-13 跨端收敛；移动端性能专项 D 加入快照）。
 *
 * 为什么抽出来：Web 与 App 的列表页共用「远端优先 + 本地兜底 + 待同步合并」这一条
 * 数据链路（离线新建的旅行必须出现在列表里，否则用户建完回列表看不到它——真机反馈过）。
 * 取数、合并、离线判定收口在一处后，桌面/移动两棵树只负责「怎么渲染」，
 * 新增入口（如未来的搜索落地页）直接复用，不再复制 fetch + merge 逻辑。
 *
 * 移动端性能（2026-11-21）：/travel 是四个 tab 之一，也是「切页卡」反馈最集中的页面。
 * 每次挂载都重新 fetch（含本地 SQLite 读取与合并）会让返回时先空一帧再出内容。
 * 这里加一层**模块级快照 + 并发去重**（30s 新鲜期）：
 *  · 回访 /travel 时同步返回上次的列表（不闪 loading、不阻塞首帧），后台静默刷新；
 *  · 同一时刻多次 reload（StrictMode 双执行、下拉刷新 + 页面切换）合并为一次；
 *  · 离线/待同步合并逻辑不变，只是结果被复用。
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

type TravelListSnapshot = {
  posts: TravelListItem[]
  offline: boolean
  at: number
}

let snapshot: TravelListSnapshot | null = null
let inflight: Promise<TravelListSnapshot> | null = null

/** 仅测试/调试用：清空快照 */
export function __resetTravelListSnapshot(): void {
  snapshot = null
  inflight = null
}

/**
 * 写操作（新建旅行等）成功后主动失效快照。
 * 不失效的话，创建流程「新建 → 进详情 → 返回列表」会在 5s 内命中旧快照，
 * 用户看到列表里没有刚建的那本。
 */
export function invalidateTravelListSnapshot(): void {
  snapshot = null
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
      return next
    })
    .finally(() => {
      inflight = null
    })
  inflight = p
  return p
}

export function useTravelList(): UseTravelListResult {
  // 首帧同步取快照：回访 /travel 不再是「先空一帧」，直接渲染上次列表
  const [posts, setPosts] = useState<TravelListItem[] | null>(() => snapshot?.posts ?? null)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(() => snapshot?.offline ?? false)
  const aliveRef = useRef(true)

  const reload = useCallback(async () => {
    try {
      const next = await loadShared()
      if (!aliveRef.current) return
      setPosts(next.posts)
      setOffline(next.offline)
      setError('')
    } catch {
      if (!aliveRef.current) return
      setError('网络错误，请稍后重试')
    }
  }, [])

  useEffect(() => {
    aliveRef.current = true
    const hit = snapshot
    if (hit) {
      // 有快照：先同步渲染（不闪 loading / 不白屏），再按新鲜期决定是否后台对齐
      setPosts(hit.posts)
      setOffline(hit.offline)
      if (Date.now() - hit.at >= SNAPSHOT_FRESH_MS) void reload()
    } else {
      void reload()
    }
    return () => {
      aliveRef.current = false
    }
  }, [reload])

  return { posts, error, offline, reload }
}
