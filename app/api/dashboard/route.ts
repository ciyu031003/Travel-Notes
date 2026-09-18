import { NextRequest, NextResponse } from 'next/server'
import { getDashboardStats } from '@/lib/services/dashboard.service'
import { getCurrentUserId } from '@/lib/current-user'
import { applyCacheControl } from '@/lib/http-cache'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    const stats = await getDashboardStats(userId)
    const res = NextResponse.json({
      provinceStats: stats.provinceStats,
      provincesVisitedCount: stats.provincesVisitedCount,
      travelCount: stats.travelCount,
      /** 城市去重口径（与「我的」页统计同源，避免两页数字不一致） */
      placeCount: stats.placeCount,
      totalPhotos: stats.totalPhotos,
      momentCount: stats.momentCount,
      totalLikes: stats.totalLikes,
      travelPosts: stats.travelPosts,
      travelTypeStats: stats.travelTypeStats,
    })
    return applyCacheControl(res, 'user', !!userId)
  } catch (error) {
    console.error('[GET /api/dashboard]', error)
    return NextResponse.json({ error: '获取数据看板失败' }, { status: 500 })
  }
}
