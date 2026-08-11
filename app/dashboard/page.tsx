import type { Metadata } from 'next'
import { getPostService, getMomentService, getLikeService } from '@/lib/container'
import { findProvinceByLocation } from '@/lib/province-map'
import DashboardClient, { DashboardData } from '@/components/dashboard/DashboardClient'

export const metadata: Metadata = {
  title: '数据看板 | 足迹与成长',
  description: '旅行足迹、学习成长与站点数据一览',
}

export const revalidate = 300

export default async function DashboardPage() {
  const postService = getPostService()
  const momentService = getMomentService()
  const likeService = getLikeService()

  // 数据获取失败时降级为空数据（构建期/数据库不可用时保证页面可渲染）
  let travelPosts: Awaited<ReturnType<typeof postService.getPostsHybrid>> = []
  let blogPosts: Awaited<ReturnType<typeof postService.getPostsHybrid>> = []
  let mindmaps: Awaited<ReturnType<typeof postService.getPostsHybrid>> = []
  let moments: Awaited<ReturnType<typeof momentService.getMoments>> = { data: [], total: 0, page: 1, pageSize: 1, hasMore: false }
  let totalLikes = 0
  try {
    ;[travelPosts, blogPosts, mindmaps, moments, totalLikes] = await Promise.all([
      postService.getPostsHybrid('travel'),
      postService.getPostsHybrid('tech/blog'),
      postService.getPostsHybrid('tech/mindmaps'),
      momentService.getMoments(1, 1),
      likeService.getTotalCount(),
    ])
  } catch (e) {
    console.error('[Dashboard] 数据获取失败，使用空数据渲染:', e)
  }

  // 省份打卡统计
  const provinceCounts = new Map<string, { name: string; count: number }>()
  for (const post of travelPosts) {
    if (!post.location) continue
    const province = findProvinceByLocation(post.location)
    if (!province) continue
    const existing = provinceCounts.get(province.id)
    if (existing) {
      existing.count += 1
    } else {
      provinceCounts.set(province.id, { name: province.name, count: 1 })
    }
  }

  // 照片总数
  let totalPhotos = 0
  for (const post of travelPosts) {
    if (post.cover) totalPhotos += 1
    totalPhotos += (post.images || []).length
  }

  const data: DashboardData = {
    provinceStats: Array.from(provinceCounts.values()).sort((a, b) => b.count - a.count),
    provincesVisitedCount: provinceCounts.size,
    travelCount: travelPosts.length,
    blogCount: blogPosts.length,
    mindmapCount: mindmaps.length,
    totalPhotos,
    momentCount: moments.total || 0,
    totalLikes,
    travelPosts: travelPosts as never[],
  }

  return <DashboardClient data={data} />
}

