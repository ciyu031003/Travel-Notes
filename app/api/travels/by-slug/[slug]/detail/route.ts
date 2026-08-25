import { NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/current-user'
import { getTravelBySlug } from '@/lib/modules/travel/travel.service'
import { getPostService } from '@/lib/container'

export const dynamic = 'force-dynamic'

/**
 * 旅行详情（按 slug）：供客户端渲染 /travel/[slug]（静态壳跨域读取）。
 * 新 Travel 优先，旧 Post 兜底；返回 contentHtml + 图片/视频 + 元信息。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const userId = await getCurrentUserId()

  const travel = await getTravelBySlug(slug, userId)
  let legacy: any = null
  if (!travel) {
    legacy = await getPostService().getPostBySlugHybrid('travel', slug, userId).catch(() => null)
  }
  if (!travel && !legacy) {
    return NextResponse.json({ error: '旅行不存在' }, { status: 404 })
  }

  const images = travel
    ? travel.cover ? [travel.cover, ...(legacy?.images || [])] : (legacy?.images || [])
    : (legacy?.images || [])

  return NextResponse.json({
    travel: travel
      ? {
          id: travel.id,
          title: travel.title,
          slug: travel.slug,
          description: travel.description,
          startDate: travel.startDate,
          status: travel.status,
          contentHtml: travel.contentHtml,
          tags: travel.tags,
          location: travel.location,
          cover: travel.cover,
          travelType: travel.travelType,
          companions: travel.companions,
        }
      : null,
    legacy: legacy
      ? {
          id: legacy.id,
          title: legacy.title,
          description: legacy.description,
          location: legacy.location,
          date: legacy.date,
          images: legacy.images || [],
          videos: legacy.videos || [],
          contentHtml: legacy.contentHtml || legacy.content,
        }
      : null,
    images,
    videos: legacy?.videos || [],
  })
}
