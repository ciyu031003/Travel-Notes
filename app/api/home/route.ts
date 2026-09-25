import { NextRequest, NextResponse } from 'next/server'
import { getPostService } from '@/lib/container'
import { findProvinceByLocation } from '@/lib/province-map'
import { listAnniversaries } from '@/lib/modules/anniversary/anniversary.service'
import { getCurrentUserId } from '@/lib/current-user'
import { applyCacheControl } from '@/lib/http-cache'
import { listTravels } from '@/lib/modules/travel/travel.service'

export const dynamic = 'force-dynamic'

/**
 * 首页聚合。
 *
 * 本次修正（真机需求："新建的旅行确认后要自动加到最近旅行与画册里"）：
 *  · 源数据并入 **Travel 行**（此前只读旧文章 Post(type='travel')，于是 App 里
 *    新建的旅行在首页"最近旅行"里根本不出现）；
 *  · 拆出 **进行中（未归档）的旅行** `draftTravels`：首页给一个大入口继续补内容，
 *    确认归档后才进"最近旅行"与画册。
 *
 * 合并规则与 `/api/travels` 一致：Travel 优先、按 slug 去重，旧文章兜底。
 */
export async function GET(_request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    const postService = getPostService()
    const [legacyPosts, anniversaries, travels] = await Promise.all([
      postService.getPostsHybrid('travel', userId),
      listAnniversaries(userId),
      listTravels(userId).catch(() => []),
    ])

    const confirmed = travels.filter((t) => t.confirmedAt)
    const drafts = travels.filter((t) => !t.confirmedAt)

    const travelPosts = confirmed.map((t) => ({
      id: 1_000_000 + t.id,
      slug: t.slug,
      title: t.title,
      date: t.startDate ?? '',
      description: t.description ?? undefined,
      cover: t.cover ?? undefined,
      images: (t.photos ?? []) as string[],
      videos: [] as unknown[],
      tags: t.tags ?? [],
      location: t.location ?? undefined,
      type: 'travel',
      published: true,
    }))

    const travelSlugs = new Set(travelPosts.map((p) => p.slug).filter(Boolean))
    const merged = [...travelPosts, ...legacyPosts.filter((p: { slug?: string }) => !travelSlugs.has(p.slug || ''))]

    const provincesVisited = new Set<string>()
    for (const post of merged) {
      if (post.location) {
        const p = findProvinceByLocation(post.location)
        if (p) provincesVisited.add(p.id)
      }
    }

    // 进行中的旅行：首页大入口需要的信息（标题/目的地/天数/已有照片数/封面）
    const draftTravels = drafts.map((t) => ({
      id: t.id,
      slug: t.slug,
      title: t.title,
      location: t.location,
      startDate: t.startDate,
      endDate: t.endDate,
      dayCount: t.dayCount,
      photoCount: (t.photos ?? []).length,
      cover: t.cover,
      createdAt: t.updatedAt,
    }))

    const res = NextResponse.json({
      travelPosts: merged,
      draftTravels,
      anniversaries,
      provincesVisitedCount: provincesVisited.size,
    })
    return applyCacheControl(res, 'user', !!userId)
  } catch (error) {
    console.error('[GET /api/home]', error)
    return NextResponse.json({ error: '获取首页数据失败' }, { status: 500 })
  }
}
