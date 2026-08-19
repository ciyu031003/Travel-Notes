/**
 * Stage 2 公开权限模型：
 * - Travel.visibility: PRIVATE（仅自己）/ COUPLE（我的 Space）/ PUBLIC（公开到旅行圈）
 * - 与旧字段 isPublic 兼容（isPublic=true 视为 PUBLIC）。
 * - 服务端读路径统一经过这里，杜绝「知道 ID 就能读到私人数据」的 IDOR。
 */
import { prisma } from '../../db'

export type TravelVisibility = 'PRIVATE' | 'COUPLE' | 'PUBLIC'

/** 判断一次旅行当前是否应当出现在旅行圈（PUBLIC 或旧 isPublic 标记） */
export function isPublishedToCircle(travel: {
  visibility: TravelVisibility
  isPublic?: boolean | null
}): boolean {
  return travel.visibility === 'PUBLIC' || travel.isPublic === true
}

/** 用户是否能读取某个旅行（IDOR 防护） */
export async function canReadTravel(userId: number | null, travelId: number): Promise<boolean> {
  const travel = await prisma.travel.findUnique({
    where: { id: travelId },
    select: { ownerId: true, spaceId: true, visibility: true, isPublic: true },
  })
  if (!travel) return false
  if (isPublishedToCircle(travel)) return true
  if (travel.ownerId != null && travel.ownerId === userId) return true
  if (travel.visibility === 'COUPLE' && userId != null && travel.spaceId != null) {
    const member = await prisma.spaceMember.findFirst({
      where: { spaceId: travel.spaceId, userId, status: 'ACTIVE' },
      select: { id: true },
    })
    if (member) return true
  }
  return false
}

/** 用户是否能读取某个媒体（IDOR 防护） */
export async function canReadMedia(userId: number | null, mediaId: number): Promise<boolean> {
  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { userId: true, spaceId: true, visibility: true, isPublic: true },
  })
  if (!media) return false
  if (media.visibility === 'PUBLIC' || media.isPublic === true) return true
  if (media.userId != null && media.userId === userId) return true
  if (media.visibility === 'COUPLE' && userId != null && media.spaceId != null) {
    const member = await prisma.spaceMember.findFirst({
      where: { spaceId: media.spaceId, userId, status: 'ACTIVE' },
      select: { id: true },
    })
    if (member) return true
  }
  return false
}
