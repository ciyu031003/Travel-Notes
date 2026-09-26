import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/current-user'
import { prisma } from '@/lib/db'
import { getTravelBySlug, getTravelMemoryPhotos, getTravelSpaceInfo } from '@/lib/modules/travel/travel.service'
import { canActOnContent, canViewResource } from '@/lib/modules/access'
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
  const user = await getCurrentUser()
  const userId = user?.id ?? null

  const travel = await getTravelBySlug(slug, userId, user?.username)
  let legacy: any = null
  if (!travel) {
    legacy = await getPostService().getPostBySlugHybrid('travel', slug, userId).catch(() => null)
  }
  if (!travel && !legacy) {
    return NextResponse.json({ error: '旅行不存在' }, { status: 404 })
  }

  const memoryPhotos = travel ? await getTravelMemoryPhotos(travel.id).catch(() => []) : []

  /**
   * 「能不能编辑」必须走**统一的写权限判读**，而不是只比 ownerId。
   *
   * 历史缺陷：这里原先写的是 `canEdit = userId === ownerId` —— 于是**空间成员看不到编辑入口**，
   * 而服务端 `canActOnContent`（OWNER/MEMBER 可写）其实是放行的。
   * 两端口径不一致的后果就是产品诉求「空间里大家一起改」落不了地：
   * 成员点开只读、找不到任何编辑/添加行程/删除按钮。
   */
  const snapshot = travel
    ? await prisma.travel
        .findUnique({
          where: { id: travel.id },
          select: { ownerId: true, spaceId: true, visibility: true, isPublic: true },
        })
        .catch(() => null)
    : null
  const ownerId = snapshot?.ownerId ?? null
  const canEdit = snapshot ? await canActOnContent('Travel', snapshot, userId).catch(() => false) : false
  const canView = snapshot ? await canViewResource('Travel', snapshot, userId).catch(() => false) : true
  // 归属空间：详情页据此展示「仅自己 / 某个空间」，并决定是否给出「移入空间」入口
  const spaceInfo = travel ? await getTravelSpaceInfo(travel.id, userId).catch(() => null) : null

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
          // 封面规范化 URL（coverMedia 缩略图优先）：相册「设为封面」后即时可见
          coverUrl: travel.coverUrl,
          coverMediaId: travel.coverMediaId,
          travelType: travel.travelType,
          companions: travel.companions,
          // 花销 tab 需要预算；与 expenses 接口的 total 一起算「预算 vs 已花」
          budget: travel.budget,
          ownerId,
          canEdit,
          canView,
          // 归属空间（个人 ↔ 空间）：可移动性由「我是不是创建者」决定
          spaceId: spaceInfo?.spaceId ?? null,
          spaceName: spaceInfo?.spaceName ?? null,
          mySpaceRole: spaceInfo?.mySpaceRole ?? null,
          canMoveSpace: !!userId && ownerId === userId,
          visibility: spaceInfo?.visibility ?? (snapshot?.visibility ? String(snapshot.visibility) : 'SPACE'),
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
