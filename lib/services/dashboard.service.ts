import { getPostService, getMomentService, getLikeService } from '../container'
import { findProvinceByLocation } from '../province-map'
import { prisma } from '../db'
import { scopedWhere } from '../visibility'

export interface DashboardStats {
  provinceStats: Array<{ name: string; count: number }>
  provincesVisitedCount: number
  travelCount: number
  totalPhotos: number
  momentCount: number
  totalLikes: number
  travelPosts: any[]
  /** 多元场景：旅行类型分布（独旅/情侣/家庭/朋友/闺蜜/结伴） */
  travelTypeStats: Array<{ type: string; count: number }>
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

  // 多元场景：从 Travel 模型统计旅行类型分布（新模型才有 travelType）
  let travelTypeStats: Array<{ type: string; count: number }> = []
  try {
    const grouped = await prisma.travel.groupBy({
      by: ['travelType'],
      where: { ...scopedWhere(userId, 'ownerId') } as any,
      _count: { _all: true },
    })
    travelTypeStats = (grouped as any[])
      .filter((g) => g.travelType)
      .map((g) => ({ type: g.travelType, count: g._count._all }))
      .sort((a, b) => b.count - a.count)
  } catch (e) {
    console.error('[Dashboard] 旅行类型统计失败，降级为空:', e)
  }

  return {
    provinceStats: Array.from(provinceCounts.values()).sort((a, b) => b.count - a.count),
    provincesVisitedCount: provinceCounts.size,
    travelCount: travelPosts.length,
    totalPhotos,
    momentCount,
    totalLikes,
    travelPosts,
    travelTypeStats,
  }
}
