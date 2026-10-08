'use client'

import HomeClient from '@/components/HomeClient'
import HomeMobile, { HomeMobileError, HomeMobileLoading } from '@/components/HomeMobile'
import AsyncState from '@/components/AsyncState'
import { useApi } from '@/lib/client/use-api'
import { apiUrl } from '@/lib/api-base'
import { useIsMobile } from '@/hooks/use-is-mobile'
import type { HomeBookSummary, HomeMoment } from '@/lib/home/types'

interface DraftTravel {
  id: number
  slug: string
  title: string
  location: string | null
  startDate: string | null
  endDate: string | null
  dayCount: number
  photoCount: number
  cover: string | null
  createdAt: string | null
}

interface HomeData {
  travelPosts: unknown[]
  /** 进行中（未归档）的旅行：首页大入口继续补内容 */
  draftTravels?: DraftTravel[]
  anniversaries: unknown[]
  provincesVisitedCount: number
  books?: HomeBookSummary[]
  recentMoments?: HomeMoment[]
}

export default function HomePage() {
  // 阶段 A · A2：统一取数层（去重/取消/统一错误），服务端 Cache-Control 兜底浏览器缓存
  const { data, error, loading, reload } = useApi<HomeData>(apiUrl('/api/home'))
  const isMobile = useIsMobile()

  if (error) {
    if (isMobile === null) {
      return <AsyncState variant="error" message={error} title="首页加载失败" />
    }
    return isMobile ? (
      <HomeMobileError message={error} onRetry={reload} />
    ) : (
      <AsyncState variant="error" message={error} title="首页加载失败" />
    )
  }
  if (loading || !data || isMobile === null) {
    return isMobile === true ? (
      <HomeMobileLoading />
    ) : (
      <AsyncState variant="loading" message="正在翻开你的旅行记忆…" />
    )
  }
  return isMobile ? (
    <HomeMobile
      travelPosts={data.travelPosts as never[]}
      draftTravels={data.draftTravels ?? []}
      provincesVisitedCount={data.provincesVisitedCount}
      anniversaries={data.anniversaries as never[]}
      books={data.books ?? []}
      recentMoments={data.recentMoments ?? []}
      onRefresh={reload}
    />
  ) : (
    <HomeClient
      travelPosts={data.travelPosts as never[]}
      provincesVisitedCount={data.provincesVisitedCount}
      anniversaries={data.anniversaries as never[]}
      draftTravels={data.draftTravels ?? []}
      books={data.books ?? []}
      recentMoments={data.recentMoments ?? []}
      onRefresh={reload}
    />
  )
}
