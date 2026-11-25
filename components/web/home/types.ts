import type { HomeBookSummary, HomeMoment } from '@/lib/home/types'

/** 首页游记卡（与 /api/home 的 travelPosts 同形，含旧文章兜底字段） */
export interface InkTravelPost {
  slug: string
  title: string
  date: string
  description?: string
  cover?: string
  images?: string[]
  tags?: string[]
  location?: string
}

export interface InkAnniversary {
  id: number
  title: string
  date: string
  recurring: boolean
  description: string | null
}

/** 进行中（未归档）的旅行：与 /api/home 的 draftTravels 同形 */
export interface InkDraftTravel {
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

export interface InkHomeProps {
  travelPosts: InkTravelPost[]
  provincesVisitedCount: number
  anniversaries?: InkAnniversary[]
  draftTravels?: InkDraftTravel[]
  onRefresh?: () => void
  books?: HomeBookSummary[]
  recentMoments?: HomeMoment[]
}
