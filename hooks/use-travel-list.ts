'use client'

import { useCallback, useEffect, useState } from 'react'
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
 * 旅行列表的共享数据层（P-13 跨端收敛）。
 *
 * 为什么抽出来：Web 与 App 的列表页共用"远端优先 + 本地兜底 + 待同步合并"这一条
 * 数据链路（离线新建的旅行必须出现在列表里，否则用户建完回列表看不到它——真机反馈过）。
 * 取数、合并、离线判定收口在一处后，桌面/移动两棵树只负责"怎么渲染"，
 * 新增入口（如未来的搜索落地页）直接复用，不再复制 fetch + merge 逻辑。
 */
export function useTravelList(): UseTravelListResult {
  const [posts, setPosts] = useState<TravelListItem[] | null>(null)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(false)

  const reload = useCallback(async () => {
    try {
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
      setPosts(result.data)
      setOffline(result.source === 'local')
    } catch {
      setError('网络错误，请稍后重试')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { posts, error, offline, reload }
}
