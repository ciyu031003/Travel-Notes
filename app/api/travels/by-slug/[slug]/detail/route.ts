import { NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/current-user'
import { prisma } from '@/lib/db'
import { getTravelBySlug, getTravelMemoryPhotos } from '@/lib/modules/travel/travel.service'
import { getPostService } from '@/lib/container'
export const dynamic = 'force-dynamic'

/**
 * 旅行详情（按 slug）：供客户端渲染 /travel/[slug]（静态壳跨域读取）。
 * 新 Travel 优先，旧 Post 兜底；返回 contentHtml + 图片/视频 + 元信息。
 *
 * 图片口径（2026-09-16 修正）：除了旅行封面与旧文章图片，**还要并入回忆里上传的照片**。
 * 早先只取封面 → 用户在详情页给回忆传了照片，顶部相册与"还没有记录"判断都看不到，
 * 看起来像"传了但没进去"。
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

  const memoryPhotos = travel ? await getTravelMemoryPhotos(travel.id).catch(() => []) : []

  // 「能不能编辑」由服务端判：详情页据此决定是否显示「编辑信息」入口。
  // ownerId 一并下发（不是敏感信息——它只用于判断"这是我自己的旅行吗"）。
  const ownerId = travel
    ? (
        await prisma.travel
          .findUnique({ where: { id: travel.id }, select: { ownerId: true } })
          .catch(() => null)
      )?.ownerId ?? null
    : null
  const canEdit = !!(userId && ownerId && userId === ownerId)

  const images = travel
    ? dedupeUrls([
        ...(travel.cover ? [travel.cover] : []),
        ...memoryPhotos,
        ...(legacy?.images || []),
      ])
    : (legacy?.images || [])

  return NextResponse.json({
    travel: travel
      ? {
          id: travel.id,
          title: travel.title,
          slug: travel.slug,
          description: travel.description,
          startDate: travel.startDate,
          // endDate 必须下发：编辑表单要回填完整区间，只给 startDate 会把区间悄悄截成 1 天
          endDate: travel.endDate,
          status: travel.status,
          contentHtml: travel.contentHtml,
          tags: travel.tags,
          location: travel.location,
          cover: travel.cover,
          travelType: travel.travelType,
          companions: travel.companions,
          ownerId,
          canEdit,
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

/** 去重但保持顺序（封面与回忆首图常常是同一张） */
function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of urls) {
    if (!u || seen.has(u)) continue
    seen.add(u)
    out.push(u)
  }
  return out
}
