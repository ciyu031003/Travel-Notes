'use client'

/**
 * 统一客户端取数钩子（阶段 A · A2）。
 * 基于 apiFetch：加载/错误/数据三态 + AbortController 取消（防竞态）+ reload。
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

export function useApi<T = unknown>(path: string, opts: { ttlMs?: number } = {}): UseApiState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  const ctrlRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    let alive = true

    setLoading(true)
    apiFetch<T>(path, { ttlMs: opts.ttlMs, signal: ctrl.signal })
      .then((d) => {
        if (alive) {
          setData(d)
          setError('')
        }
      })
      .catch((e: unknown) => {
        if (alive && !ctrl.signal.aborted) {
          setError(e instanceof Error ? e.message : '网络错误，请稍后重试')
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
      ctrl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  return { data, error, loading, reload }
}
