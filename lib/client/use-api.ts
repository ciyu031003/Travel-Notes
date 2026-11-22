'use client'

/**
 * 统一客户端取数钩子（阶段 A · A2；移动端性能专项 D 扩写）。
 * 基于 apiFetch：加载/错误/数据三态 + AbortController 取消（防竞态）+ reload。
 *
 * 移动端性能专项（2026-11-21）新增两层能力，目标是「回退/切 tab 不再白屏重取」：
 *
 * 1) **快照优先（stale-while-revalidate）**
 *    模块级内存缓存按 path 存最近一次结果：再次挂载时**同步**返回快照（不置 loading），
 *    所以 /me ⇄ /travel 来回切时用户立刻看到上次的内容，而不是整屏 AsyncState 转圈；
 *    快照过期（> ttlMs）时在后台静默重取，回来后替换，不闪骨架。
 * 2) **并发去重 + 聚焦重取**
 *    apiFetch 原本的 inflight 去重只在「不传 signal」时生效，而本钩子过去总是传 signal，
 *    等于去重从未生效（同一 path 的重复请求照发，移动端弱网下双倍耗时）。
 *    现在把共享的网络请求提到钩子层（同一 path 共用同一个 Promise，无 signal），
 *    页面只做「订阅 + 卸载后忽略结果」；页面重新可见（visibilitychange/focus）且快照过期时补一次。
 *
 * 语义变化说明：卸载不再中断网络请求（请求很短，且结果会进快照供下次使用）；
 * `reload()` 仍走绕过缓存 + 置 loading 的旧语义（显式重试用）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from './api'

export interface UseApiState<T> {
  data: T | null
  error: string
  loading: boolean
  /** 手动重新拉取（绕过内存缓存） */
  reload: () => void
}

export interface UseApiOptions {
  /** 快照新鲜期（毫秒）。默认 20s：足够覆盖 tab 来回切，又不会让数据明显陈旧 */
  ttlMs?: number
  /** 页面重新可见时是否补一次过期快照（默认开） */
  revalidateOnFocus?: boolean
}

const DEFAULT_TTL_MS = 20_000

type Snapshot = { value: unknown; at: number }
const snapshots = new Map<string, Snapshot>()
const inflight = new Map<string, Promise<unknown>>()

/** 同步读快照（未过期才算命中） */
function readSnapshot(path: string, ttlMs: number): Snapshot | null {
  const entry = snapshots.get(path)
  if (!entry) return null
  if (ttlMs > 0 && Date.now() - entry.at > ttlMs) return null
  return entry as Snapshot
}

/**
 * 共享取数：同一 path 的并发请求合并为一次网络往返，结果写入快照。
 * 不传 signal（共享 Promise 不能被单页取消），取消语义由调用方的 alive 标记负责。
 */
function loadShared<T>(path: string, bypassSnapshot: boolean): Promise<T> {
  if (!bypassSnapshot) {
    const hit = snapshots.get(path)
    if (hit) return Promise.resolve(hit.value as T)
  }
  const existing = inflight.get(path)
  if (existing) return existing as Promise<T>
  const p = apiFetch<T>(path, {
    bypassMemoryCache: bypassSnapshot,
    cache: bypassSnapshot ? 'no-store' : 'default',
  })
    .then((value) => {
      snapshots.set(path, { value, at: Date.now() })
      return value
    })
    .finally(() => {
      inflight.delete(path)
    })
  inflight.set(path, p)
  return p
}

/** 仅测试/调试用：清空钩子层快照 */
export function __resetUseApiSnapshots(): void {
  snapshots.clear()
  inflight.clear()
}

/**
 * 主动失效快照（写操作成功后调用）。
 *
 * 为什么必须有：快照是「跨页面」共享的，创建/删除/改资料之后如果不清，
 * 用户回到列表会看到最多 ttlMs 之前的旧数据（「刚建的旅行不见了」）。
 * 传 path 精确失效；不传则清空全部（写操作影响面不确定时用）。
 */
export function invalidateUseApi(path?: string): void {
  if (path) snapshots.delete(path)
  else snapshots.clear()
}

export function useApi<T = unknown>(path: string, opts: UseApiOptions = {}): UseApiState<T> {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
  const revalidateOnFocus = opts.revalidateOnFocus !== false

  // 初始状态同步取快照：命中则首帧即有数据、不闪 loading（回退白屏的直接解药）
  const [data, setData] = useState<T | null>(() => {
    const hit = readSnapshot(path, ttlMs)
    return hit ? (hit.value as T) : null
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(() => readSnapshot(path, ttlMs) === null)
  const [version, setVersion] = useState(0)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    const bypass = version > 0
    // 命中快照且未过期：直接收工（后台不打扰）
    if (!bypass) {
      const hit = readSnapshot(path, ttlMs)
      if (hit) {
        setData(hit.value as T)
        setError('')
        setLoading(false)
        return () => { aliveRef.current = false }
      }
    } else {
      setLoading(true)
    }

    loadShared<T>(path, bypass)
      .then((d) => {
        if (!aliveRef.current) return
        setData(d)
        setError('')
      })
      .catch((e: unknown) => {
        if (!aliveRef.current) return
        setError(e instanceof Error ? e.message : '网络错误，请稍后重试')
      })
      .finally(() => {
        if (aliveRef.current) setLoading(false)
      })

    return () => {
      aliveRef.current = false
    }
  }, [path, version, ttlMs])

  // 聚焦/重新可见时：快照过期才补一次静默重取（不置 loading，不闪骨架）
  useEffect(() => {
    if (!revalidateOnFocus) return
    const revalidate = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (readSnapshot(path, ttlMs)) return
      // 必须 bypass 快照：纯读快照会直接返回旧值，聚焦重取等于没做。
      loadShared<T>(path, true)
        .then((d) => {
          if (!aliveRef.current) return
          setData(d)
          setError('')
        })
        .catch(() => {})
    }
    document.addEventListener('visibilitychange', revalidate)
    window.addEventListener('focus', revalidate)
    return () => {
      document.removeEventListener('visibilitychange', revalidate)
      window.removeEventListener('focus', revalidate)
    }
  }, [path, ttlMs, revalidateOnFocus])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  return { data, error, loading, reload }
}