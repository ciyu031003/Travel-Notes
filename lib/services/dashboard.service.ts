import { getPostService, getMomentService, getLikeService } from '../container'
import { findProvinceByLocation } from '../province-map'

export interface DashboardStats {
  provinceStats: Array<{ name: string; count: number }>
  provincesVisitedCount: number
  travelCount: number
  totalPhotos: number
  momentCount: number
  totalLikes: number
  travelPosts: any[]
}

/**
 * 数据看板统计（旅行档案 / 数据看板共用同一份统计口径）。
 * 任一数据源失败时降级为 0，保证页面可渲染。
 */
export async function getDashboardStats(userId?: number | null): Promise<DashboardStats> {
  const postService = getPostService()
  const momentService = getMomentService()
  const likeService = getLikeService()

  let travelPosts: any[] = []
  let momentCount = 0
  let totalLikes = 0
  try {
    ;[travelPosts, { total: momentCount }, totalLikes] = await Promise.all([
      postService.getPostsHybrid('travel', userId),
      momentService.getMoments(1, 1, userId),
      likeService.getTotalCount(),
    ] as const)
  } catch (e) {
    console.error('[Dashboard] 数据获取失败，使用空数据渲染:', e)
  }

  const provinceCounts = new Map<string, { name: string; count: number }>()
  for (const post of travelPosts) {
    if (!post.location) continue
    const province = findProvinceByLocation(post.location)
    if (!province) continue
    const existing = provinceCounts.get(province.id)
    if (existing) existing.count += 1
    else provinceCounts.set(province.id, { name: province.name, count: 1 })
  }

  let totalPhotos = 0
  for (const post of travelPosts) {
    if (post.cover) totalPhotos += 1
    totalPhotos += (post.images || []).length
  }

  return {
    provinceStats: Array.from(provinceCounts.values()).sort((a, b) => b.count - a.count),
    provincesVisitedCount: provinceCounts.size,
    travelCount: travelPosts.length,
    totalPhotos,
    momentCount,
    totalLikes,
    travelPosts,
  }
}
