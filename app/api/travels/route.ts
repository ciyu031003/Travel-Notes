import { NextRequest, NextResponse } from 'next/server'
import { getPostService } from '@/lib/container'
import { getCurrentUserId } from '@/lib/current-user'
import { applyCacheControl } from '@/lib/http-cache'
import { listTravels } from '@/lib/modules/travel/travel.service'

export const dynamic = 'force-dynamic'

/**
 * 旅行记录列表（面向 /travel 前台地图与列表）。
 *
 * 数据源合并（修复"前台新建旅行不出现在列表"）：
 * - Travel 模型：TravelComposer（Web/移动端新建入口）与后台 /admin/travels 写入的行。
 * - Post(type=travel)：历史数据源（首页 /api/home、数据看板同源）。
 *
 * 历史：v3.1 曾因"Travel 表为空导致地图/统计为 0"整体回退到 Post——但 TravelComposer
 * 写的是 Travel 模型，用户前台新建的旅行从此不再出现在列表（E2E 冒烟抓到）。
 * 现改为双源合并：Travel 行映射为 post 形状排在前面，slug 去重防止同主题重复；
 * Travel 行 id 加固定偏移（1_000_000）避免与 Post 自增 id 撞 React key（跳转链接用 slug，不受影响）。
 */
export async function GET(_request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    const postService = getPostService()
    const [posts, travels] = await Promise.all([
      postService.getPostsHybrid('travel', userId),
      listTravels(userId).catch(() => []),
    ])

    const travelPosts = travels.map((t) => ({
      id: 1_000_000 + t.id,
      slug: t.slug,
      title: t.title,
      date: t.startDate ?? '',
      description: t.description ?? undefined,
      cover: t.cover ?? undefined,
      images: [] as string[],
      videos: [] as unknown[],
      tags: t.tags ?? [],
      location: t.location ?? undefined,
      type: 'travel',
      published: true,
    }))
    const travelSlugs = new Set(travelPosts.map((p) => p.slug).filter(Boolean))
    const merged = [...travelPosts, ...posts.filter((p: { slug?: string }) => !travelSlugs.has(p.slug || ''))]

    const res = NextResponse.json({ posts: merged })
    return applyCacheControl(res, 'user', !!userId)
  } catch (error) {
    console.error('[GET /api/travels]', error)
    return NextResponse.json({ error: '获取旅行记录失败' }, { status: 500 })
  }
}
