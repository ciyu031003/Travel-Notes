import type { Metadata } from 'next'
import DashboardClient, { DashboardData } from '@/components/dashboard/DashboardClient'
import { getDashboardStats } from '@/lib/services/dashboard.service'

export const metadata: Metadata = {
  title: '数据看板 | 足迹与成长',
  description: '旅行足迹与共同回忆数据一览',
}

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { getCurrentUserId } = await import('@/lib/current-user')
  const userId = await getCurrentUserId()
  const stats = await getDashboardStats(userId)

  const data: DashboardData = {
    provinceStats: stats.provinceStats,
    provincesVisitedCount: stats.provincesVisitedCount,
    travelCount: stats.travelCount,
    totalPhotos: stats.totalPhotos,
    momentCount: stats.momentCount,
    totalLikes: stats.totalLikes,
    travelPosts: stats.travelPosts as never[],
  }

  return <DashboardClient data={data} />
}
