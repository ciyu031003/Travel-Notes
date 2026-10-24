'use client'

import { useEffect, useState, useCallback } from 'react'
import TravelClient from './TravelClient'
import TravelMobileClient, { TravelMobileLoading } from './TravelMobileClient'
import AsyncState from '@/components/AsyncState'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { apiUrl } from '@/lib/api-base'
import { readWithFallback } from '@/lib/modules/offline/repository'
import {
  mergeLocalTravelsIntoRemote,
  readAllLocalTravels,
  readLocalTravels,
} from '@/lib/modules/offline/travel-read'

export default function TravelPage() {
  const [posts, setPosts] = useState<unknown[] | null>(null)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(false)

  /**
   * 移动 / 桌面只渲染一支（2026-10-24）。
   *
   * 此前用 `hidden md:block` 双向渲染：两棵树都挂载，手机上隐藏的桌面
   * TravelClient 照样 dynamicImport 下 d3-geo 地图大 chunk、多发一次
   * /api/travel/settings 请求 —— tab 切换可感知变慢（移动端性能税）。
   * 代价是 SSR/水合首帧（null）只能给中性骨架，正好与首页的三态口径一致。
   */
  const isMobile = useIsMobile()

  const load = useCallback(async () => {
    try {
      const result = await readWithFallback<unknown[]>(
        async () => {
          const res = await fetch(apiUrl('/api/travels'), { credentials: 'include', cache: 'no-cache' })
          if (!res.ok) throw new Error('http ' + res.status)
          const j = await res.json()
          if (j && j.error) throw new Error(String(j.error))
          const remote = (j?.posts || []) as unknown[]
          // 【关键】在线时也要把「本地待同步」的旅行合并进来。
          // 原先只返回远端，刚在 App 里新建、还在同步队列里的那一本不会出现，
          // 用户建完回列表看不到它（真机反馈的 bug）。合并逻辑见 mergeLocalTravelsIntoRemote。
          const local = await readAllLocalTravels()
          return mergeLocalTravelsIntoRemote(remote as Record<string, unknown>[], local) as unknown[]
        },
        async () => {
          const local = await readLocalTravels()
          return local as unknown[] | null
        },
      )
      setPosts(result.data)
      setOffline(result.source === 'local')
    } catch {
      setError('网络错误，请稍后重试')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) {
    if (isMobile === true) return <TravelMobileLoading message={error} />
    return <AsyncState variant="error" message={error} title="旅行记录加载失败" />
  }
  if (!posts || isMobile === null) {
    return <AsyncState variant="loading" message="正在加载旅行记录…" />
  }
  return isMobile ? (
    <TravelMobileClient posts={posts as never[]} offline={offline} onRefresh={load} />
  ) : (
    <TravelClient posts={posts as never[]} offline={offline} />
  )
}
