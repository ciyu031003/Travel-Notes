import { getPostService } from '@/lib/container'
import { findProvinceByLocation } from '@/lib/province-map'
import HomeClient from '@/components/HomeClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '我们的小家 | 旅行记录 & 学习笔记',
  description: '记录旅行足迹，分享学习笔记，收藏美好时光',
}

export default async function Home() {
  const postService = getPostService()
  const [travelPosts, blogPosts] = await Promise.all([
    postService.getPostsHybrid('travel'),
    postService.getPostsHybrid('tech/blog'),
  ])

  const provincesVisited = new Set<string>()
  for (const post of travelPosts) {
    if (post.location) {
      const p = findProvinceByLocation(post.location)
      if (p) provincesVisited.add(p.id)
    }
  }

  const totalPosts = travelPosts.length + blogPosts.length

  return (
    <HomeClient
      travelPosts={travelPosts}
      blogPosts={blogPosts}
      provincesVisitedCount={provincesVisited.size}
      totalPosts={totalPosts}
    />
  )
}
