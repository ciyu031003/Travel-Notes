import { getPostService, getMomentService } from '@/lib/container'
import { findProvinceByLocation } from '@/lib/province-map'
import { listAnniversaries } from '@/lib/modules/anniversary/anniversary.service'
import { listTravels } from '@/lib/modules/travel/travel.service'
import { listTravelBookSummaries } from '@/lib/modules/album/travel-book.service'
import type { HomeBookSummary, HomeMoment } from './types'

/**
 * 首页聚合数据（P1-18）：从 /api/home 抽出，供 **服务端组件** 与 **API 路由** 共用。
 *
 * 为什么抽出来：首页此前是「客户端壳 + 水合后再 fetch /api/home」，服务端 HTML 只有
 * 骨架屏 —— 爬虫/无 JS 场景拿到空壳，弱网首屏要等 JS 下载 + 一次往返。把聚合逻辑
 * 放进纯服务端函数后，`app/page.tsx`（Server Component）可以首帧直接出真实内容；
 * route 复用同一个函数，响应字段/语义保持完全一致（App 端离线同步依赖它）。
 *
 * 刻意**不读 cookies**：调用方传入 userId（route 与 page 各自用 getCurrentUserId 取），
 * 这样本函数保持纯净、可被单测/复用，也避免在非请求上下文里误触动态 API。
 */

/** 进行中（未归档）的旅行：首页大入口需要的字段（与 /api/home 的 draftTravels 同形） */
export interface HomeDraftTravel {
  id: number
  slug: string
  title: string
  location: string | null
  startDate: string | null
  endDate: string | null
  dayCount: number
  photoCount: number
  cover: string | null
  createdAt: string | null
}

/**
 * 首页数据契约。
 *
 * travelPosts 用 unknown[] 而不是 PostMetaDB：这里同时包含「Travel 行映射出的假文章」
 * 与「旧 Post 兜底」，两者字段集不同；消费端（HomeClient/HomeMobile）已有自己的
 * PostMeta 形状，服务端只需保证 JSON 形态与原 route 一致。
 */
export interface HomeData {
  travelPosts: unknown[]
  draftTravels: HomeDraftTravel[]
  anniversaries: unknown[]
  provincesVisitedCount: number
  books: HomeBookSummary[]
  recentMoments: HomeMoment[]
}

/**
 * 首页聚合查询（保留原 route 的全部合并规则）：
 *  · 源数据并入 **Travel 行**（App 里新建的旅行必须出现在"最近旅行"）；
 *  · 拆出 **进行中（未归档）的旅行** draftTravels；
 *  · 与 /api/travels 一致：Travel 优先、按 slug 去重，旧文章兜底。
 *
 * 单个附属数据源失败时降级为空数组（与原 route 相同）；主数据源失败则抛出，
 * 由调用方决定是 500（route）还是回退客户端取数（page）。
 */
export async function getHomeData(userId: number | null): Promise<HomeData> {
  const postService = getPostService()
  const [legacyPosts, anniversaries, travels, books, recentMoments] = await Promise.all([
    postService.getPostsHybrid('travel', userId),
    listAnniversaries(userId),
    listTravels(userId).catch(() => []),
    listTravelBookSummaries(userId)
      .then((items) => items.slice(0, 8))
      .catch(() => []),
    getMomentService()
      .getRecentMoments(3, userId)
      .catch(() => []),
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

  const draftTravels: HomeDraftTravel[] = drafts.map((t) => ({
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

  return {
    travelPosts: merged,
    draftTravels,
    anniversaries,
    provincesVisitedCount: provincesVisited.size,
    books,
    recentMoments,
  }
}
