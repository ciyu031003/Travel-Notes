import { NextRequest, NextResponse } from 'next/server'
import { getPostService } from '@/lib/container'
import { findProvinceByLocation } from '@/lib/province-map'
import { listAnniversaries } from '@/lib/modules/anniversary/anniversary.service'
import { getCurrentUserId } from '@/lib/current-user'
import { applyCacheControl } from '@/lib/http-cache'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    const postService = getPostService()
    const [travelPosts, anniversaries] = await Promise.all([
      postService.getPostsHybrid('travel', userId),
      listAnniversaries(userId),
    ])

    const provincesVisited = new Set<string>()
    for (const post of travelPosts) {
      if (post.location) {
        const p = findProvinceByLocation(post.location)
        if (p) provincesVisited.add(p.id)
      }
    }

    const res = NextResponse.json({
      travelPosts,
      anniversaries,
      provincesVisitedCount: provincesVisited.size,
    })
    return applyCacheControl(res, 'user', !!userId)
  } catch (error) {
    console.error('[GET /api/home]', error)
    return NextResponse.json({ error: '获取首页数据失败' }, { status: 500 })
  }
}
