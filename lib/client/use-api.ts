'use client'

/**
 * 统一客户端取数钩子（阶段 A · A2；移动端性能专项 D 扩写；E1 加入本地持久化水合）。
 * 基于 apiFetch：加载/错误/数据三态 + AbortController 取消（防竞态）+ reload。
 *
 * 三层能力，目标是「打开 App / 回退 / 切 tab 都不白屏」：
 *
 * 1) **快照优先（stale-while-revalidate）**
 *    按 path 存最近一次结果：再次挂载时**同步**返回快照（不置 loading），
 *    所以 /me ⇄ /travel 来回切时用户立刻看到上次的内容，而不是整屏 AsyncState 转圈；
 *    快照过期（> ttlMs）时在后台静默重取，回来后替换，不闪骨架。
 * 2) **并发去重 + 聚焦重取**
 *    apiFetch 原本的 inflight 去重只在「不传 signal」时生效，而本钩子过去总是传 signal，
 *    等于去重从未生效（同一 path 的重复请求照发，移动端弱网下双倍耗时）。
 *    现在把共享的网络请求提到钩子层（同一 path 共用同一个 Promise，无 signal），
 *    页面只做「订阅 + 卸载后忽略结果」；页面重新可见（visibilitychange/focus）且快照过期时补一次。
 * 3) **跨进程持久化（E1，2026-11-21）**
 *    内存快照重启即失效（App 冷/热启动、WebView 重开、刷新），移动静态壳又没有服务端直出，
 *    于是首屏只能等网络。这里把成功结果经 lib/client/persisted-cache 落 localStorage：
 *    挂载时 sync 读 → 首帧就有内容 → 再后台 revalidate（命中持久化数据时**永不**跳过刷新）。
 *    读写都在浏览器侧完成，且读取放在 layout effect 里（不是 useState 初始化器），
 *    避免「服务端渲染骨架 / 客户端渲染内容」的 hydration mismatch。
 *
 * 语义变化说明：卸载不再中断网络请求（请求很短，且结果会进快照供下次使用）；
 * `reload()` 仍走绕过缓存 + 置 loading 的旧语义（显式重试用）。网络失败时若已有本地内容，
 * 保留内容而不打回错误态（本地优先）；会话失效（401）例外 —— 清掉本地快照并照常上报，
 * 由页面走登录跳转。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, isSessionExpiredError } from './api'
import {
  PERSISTED_TTL_MS,
  clearPersistedCache,
  dropPersistedCache,
  persistSoon,
  readPersistedCache,
  useIsomorphicLayoutEffect,
} from './persisted-cache'

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
  /** 是否把成功结果落 localStorage 供下次启动水合（默认开） */
  persist?: boolean
  /** 持久化快照的新鲜期（默认 24h）；超期不参与水合 */
  persistTtlMs?: number
}

const DEFAULT_TTL_MS = 20_000

/**
 * 内存快照。persisted=true 表示这条来自 localStorage（上次进程），
 * **永远不算「新鲜」**：哪怕时间戳还在 ttlMs 内，也必须再校准一次（可能来自上次登录/旧数据）。
 */
type Snapshot = { value: unknown; at: number; persisted?: boolean }
const snapshots = new Map<string, Snapshot>()
const inflight = new Map<string, Promise<unknown>>()

/** 内部命中结果：fresh=false 表示「可以先渲染，但必须后台校准」 */
interface SnapshotHit {
  value: unknown
  at: number
  fresh: boolean
}

/** 只读内存快照（水合阶段模块内恒为空 → 与 SSR 输出一致，天然不会 mismatch） */
function readMemorySnapshot(path: string): Snapshot | null {
  return snapshots.get(path) ?? null
}

/**
 * 读快照（内存 → 持久化）。持久化命中会回填内存，并**永远**标记为「需要后台校准」：
 * 它可能来自上一次进程、甚至上一次登录，不能当作新鲜数据。
 */
function readSnapshot(path: string, ttlMs: number, persistTtlMs: number): SnapshotHit | null {
  const mem = snapshots.get(path)
  if (mem) {
    const fresh = mem.persisted !== true && !(ttlMs > 0 && Date.now() - mem.at > ttlMs)
    return { value: mem.value, at: mem.at, fresh }
  }
  const persisted = readPersistedCache<unknown>(path, { ttlMs: persistTtlMs })
  if (!persisted) return null
  const snap: Snapshot = { value: persisted.value, at: persisted.at, persisted: true }
  snapshots.set(path, snap)
  return { value: snap.value, at: snap.at, fresh: false }
}

/**
 * 共享取数：同一 path 的并发请求合并为一次网络往返，结果写入快照（内存 + localStorage）。
 * 不传 signal（共享 Promise 不能被单页取消），取消语义由调用方的 alive 标记负责。
 *
 * @param bypassSnapshot true = 必须走网络（过期快照的静默校准 / 显式 reload）
 */
function loadShared<T>(path: string, bypassSnapshot: boolean, persist: boolean): Promise<T> {
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
      // 落盘推迟到下一帧之后：几百 KB 的 JSON.stringify + setItem 不该卡在数据上屏那一帧
      if (persist) persistSoon(path, value)
      return value
    })
    .finally(() => {
      inflight.delete(path)
    })
  inflight.set(path, p)
  return p
}

/** 仅测试/调试用：清空钩子层快照（内存；持久化用 persisted-cache 的清理函数） */
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
 * E1 起同时失效 localStorage 里的持久化快照，避免「重启 App 又看到旧数据」。
 */
export function invalidateUseApi(path?: string): void {
  if (path) {
    snapshots.delete(path)
    dropPersistedCache(path)
  } else {
    snapshots.clear()
    clearPersistedCache()
  }
}

export function useApi<T = unknown>(path: string, opts: UseApiOptions = {}): UseApiState<T> {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
  const revalidateOnFocus = opts.revalidateOnFocus !== false
  const persist = opts.persist !== false
  const persistTtlMs = opts.persistTtlMs ?? PERSISTED_TTL_MS

  // 初始状态只取内存快照：客户端切页时即时命中；硬加载（水合）时模块内为空 → 与 SSR 一致
  const [data, setData] = useState<T | null>(() => {
    const mem = readMemorySnapshot(path)
    return mem ? (mem.value as T) : null
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(() => readMemorySnapshot(path) === null)
  const [version, setVersion] = useState(0)
  const aliveRef = useRef(true)
  /** 与 state 同步的最近数据：后台刷新失败时据此判断「要不要把用户打回错误态」 */
  const dataRef = useRef<T | null>(data)

  const applyData = useCallback((next: T | null) => {
    dataRef.current = next
    setData(next)
  }, [])

  /**
   * 水合后、首次绘制前：同步读持久化快照。
   * 这一步是「打开 App 立刻有内容」的核心 —— 服务端/静态壳的 HTML 只有骨架，
   * 水合一提交就把上次的内容换上去，用户不会看到「骨架 → 再等 5 秒 → 内容」。
   */
  useIsomorphicLayoutEffect(() => {
    if (version > 0) return
    if (dataRef.current !== null) return
    const persisted = readPersistedCache<T>(path, { ttlMs: persistTtlMs })
    if (!persisted) return
    snapshots.set(path, { value: persisted.value, at: persisted.at, persisted: true })
    applyData(persisted.value)
    setLoading(false)
  }, [path, version, persistTtlMs, applyData])

  useEffect(() => {
    aliveRef.current = true
    const bypass = version > 0
    // 命中快照：先渲染。内存且未过期 → 直接收工（后台不打扰）；
    // 过期或来自持久化 → 静默后台校准（不置 loading、不清空已有内容）。
    if (!bypass) {
      const hit = readSnapshot(path, ttlMs, persistTtlMs)
      if (hit) {
        applyData(hit.value as T)
        setError('')
        setLoading(false)
        if (hit.fresh) {
          return () => {
            aliveRef.current = false
          }
        }
      } else {
        setLoading(true)
      }
    } else {
      setLoading(true)
    }

    // 需要校准：绕过快照直接走网络
    const mustBypass = bypass || readMemorySnapshot(path) !== null
    loadShared<T>(path, mustBypass, persist)
      .then((d) => {
        if (!aliveRef.current) return
        applyData(d)
        setError('')
      })
      .catch((e: unknown) => {
        if (!aliveRef.current) return
        // 会话失效：本地快照属于上一个会话，先清掉（隐私），再照常上报给页面跳登录
        if (isSessionExpiredError(e)) clearPersistedCache()
        // 已有本地内容时，一次网络失败不该把用户打回错误页（本地优先）
        if (dataRef.current !== null && !isSessionExpiredError(e)) return
        setError(e instanceof Error ? e.message : '网络错误，请稍后重试')
      })
      .finally(() => {
        if (aliveRef.current) setLoading(false)
      })

    return () => {
      aliveRef.current = false
    }
  }, [path, version, ttlMs, persistTtlMs, persist, applyData])

  // 聚焦/重新可见时：快照过期才补一次静默重取（不置 loading，不闪骨架）
  useEffect(() => {
    if (!revalidateOnFocus) return
    const revalidate = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      const hit = readSnapshot(path, ttlMs, persistTtlMs)
      if (hit?.fresh) return
      // 必须 bypass 快照：纯读快照会直接返回旧值，聚焦重取等于没做。
      loadShared<T>(path, true, persist)
        .then((d) => {
          if (!aliveRef.current) return
          applyData(d)
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
  }, [path, ttlMs, persistTtlMs, persist, revalidateOnFocus, applyData])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  return { data, error, loading, reload }
}
