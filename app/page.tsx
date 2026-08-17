import { getPostService } from '@/lib/container'
import { findProvinceByLocation } from '@/lib/province-map'
import { listAnniversaries } from '@/lib/modules/anniversary/anniversary.service'
import HomeClient from '@/components/HomeClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '我们的小家 | 旅行记录 & 共同回忆',
  description: '记录两个人的旅行足迹与共同回忆',
}

export default async function Home() {
  const { getCurrentUserId } = await import('@/lib/current-user')
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

  return (
    <HomeClient
      travelPosts={travelPosts}
      provincesVisitedCount={provincesVisited.size}
      anniversaries={anniversaries}
    />
  )
}
