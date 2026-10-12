'use client'

import dynamic from 'next/dynamic'
import AsyncState from '@/components/AsyncState'
import { HomeMobileError } from '@/components/HomeMobileStates'
import { HomeLoading, HomeDesktopLoading } from '@/components/HomeLoading'
import { useApi } from '@/lib/client/use-api'
import { apiUrl } from '@/lib/api-base'
import { useIsMobile } from '@/hooks/use-is-mobile'
import type { HomeBookSummary, HomeMoment } from '@/lib/home/types'

// P1-5：加载态统一走「复刻真实版面的骨架」，不再用居中转圈 ——
// 转圈之后整页跳变成完全不同结构，是 CLS 与"感知慢"的主因。
const HomeClient = dynamic(() => import('@/components/HomeClient'), {
  ssr: false,
  loading: () => <HomeDesktopLoading />,
})

const HomeMobile = dynamic(() => import('@/components/HomeMobile'), {
  ssr: false,
  loading: () => <HomeLoading />,
})

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
    // P1-5：错误态**必须带重试**。此前三处 AsyncState 都没传 onAction，
    // 用户看到"加载失败"却无路可走，只能手动刷新整页。
    if (isMobile === null) {
      return <AsyncState variant="error" message={error} title="首页加载失败" actionLabel="重试" onAction={reload} />
    }
    return isMobile ? (
      <HomeMobileError message={error} onRetry={reload} />
    ) : (
      <AsyncState variant="error" message={error} title="首页加载失败" actionLabel="重试" onAction={reload} />
    )
  }
  if (loading || !data || isMobile === null) {
    return <HomeLoading />
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
