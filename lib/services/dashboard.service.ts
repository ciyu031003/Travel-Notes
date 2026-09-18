import { getPostService, getMomentService, getLikeService } from '../container'
import { findProvinceByLocation } from '../province-map'
import { prisma } from '../db'
import { scopedWhere } from '../visibility'
import { getTravelArchiveStats } from '../modules/travel/travel-stats'

export interface DashboardStats {
  provinceStats: Array<{ name: string; count: number }>
  provincesVisitedCount: number
  travelCount: number
  totalPhotos: number
  /** 城市去重口径（与「我的」页一致） */
  placeCount: number
  momentCount: number
  totalLikes: number
  travelPosts: any[]
  /** 多元场景：旅行类型分布（独旅/情侣/家庭/朋友/闺蜜/结伴） */
  travelTypeStats: Array<{ type: string; count: number }>
}

/**
 * 数据看板统计。
 *
 * ⚠️ 口径（R3 统一）：`travelCount` / `totalPhotos` / 省份分布**不再自己读 `Post(type='travel')`**，
 * 而是走 `lib/modules/travel/travel-stats.ts` —— 与「我的」页同一份事实源。
 *
 * 为什么必须改：两处原先各读一张表（这里读旧文章、/api/me 读 Travel），
 * 于是同一批旅行在「我的」显示 0、在「数据看板」显示 4，用户直接反馈"统计都是 0/对不上"。
 */
export async function getDashboardStats(userId?: number | null): Promise<DashboardStats> {
  const momentService = getMomentService()
  const likeService = getLikeService()

  let travelPosts: any[] = []
  let momentCount = 0
  let totalLikes = 0
  try {
    ;[travelPosts, { total: momentCount }, totalLikes] = await Promise.all([
      postServiceListFor(userId),
      momentService.getMoments(1, 1, userId),
      likeService.getTotalCount(),
    ] as const)
  } catch (e) {
    console.error('[Dashboard] 数据获取失败，使用空数据渲染:', e)
  }

  // 统一口径的统计（Travel 为主，旧文章兜底）
  let archive = { travelCount: 0, placeCount: 0, photoCount: 0, provinceCount: 0 }
  let provinceStats: Array<{ name: string; count: number }> = []
  if (userId) {
    try {
      archive = await getTravelArchiveStats(userId)
      // 省份分布：按 unified 口径的旅行 location 聚合
      const provinceCounts = new Map<string, { name: string; count: number }>()
      for (const post of travelPosts) {
        if (!post.location) continue
        const province = findProvinceByLocation(post.location)
        if (!province) continue
        const existing = provinceCounts.get(province.id)
        if (existing) existing.count += 1
        else provinceCounts.set(province.id, { name: province.name, count: 1 })
      }
      provinceStats = Array.from(provinceCounts.values()).sort((a, b) => b.count - a.count)
    } catch (e) {
      console.error('[Dashboard] 统计口径失败，降级为空:', e)
    }
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
    provinceStats,
    provincesVisitedCount: archive.provinceCount,
    travelCount: archive.travelCount,
    totalPhotos: archive.photoCount,
    placeCount: archive.placeCount,
    momentCount,
    totalLikes,
    travelPosts,
    travelTypeStats,
  }
}

/**
 * 看板里的"旅行列表"仍走 `getPostsHybrid`（旧文章），用于下面的列表渲染。
 * 但**统计数字不从这里取** —— 那是上面 `getTravelArchiveStats` 的职责。
 * 拆成独立函数是为了让"列表"与"统计"两种用途一眼可辨，避免下次又混用。
 */
async function postServiceListFor(userId?: number | null): Promise<any[]> {
  const postService = getPostService()
  return postService.getPostsHybrid('travel', userId)
}
