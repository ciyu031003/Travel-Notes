import { getPostService } from '@/lib/container'
import { findProvinceByLocation } from '@/lib/province-map'
import HomeClient from '@/components/HomeClient'

export const revalidate = 300

export const metadata = {
  title: '我们的小家 | 旅行记录 & 共同回忆',
  description: '记录两个人的旅行足迹与共同回忆',
}

export default async function Home() {
  const postService = getPostService()
  const travelPosts = await postService.getPostsHybrid('travel')

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
    />
  )
}
