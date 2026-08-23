/**
 * Stage 2 公开权限模型：
 * - Travel.visibility: PRIVATE（仅自己）/ COUPLE（我的 Space）/ PUBLIC（公开到旅行圈）
 * - 与旧字段 isPublic 兼容（isPublic=true 视为 PUBLIC）。
 * - 服务端读路径统一经过这里，杜绝「知道 ID 就能读到私人数据」的 IDOR。
 *
 * v3.1 M2-B1：判读逻辑已收敛到 lib/modules/access/（统一 canViewResource 中间层），
 * 本文件保留兼容导出（isPublishedToCircle 仍为同步函数，供既有调用方使用）。
 */
import { prisma } from '../../db'
import { canViewResource } from '../access'

export type TravelVisibility = 'PRIVATE' | 'COUPLE' | 'PUBLIC'

/** 判断一次旅行当前是否应当出现在旅行圈（PUBLIC 或旧 isPublic 标记） */
export function isPublishedToCircle(travel: {
  visibility: TravelVisibility
  isPublic?: boolean | null
}): boolean {
  return travel.visibility === 'PUBLIC' || travel.isPublic === true
}

/** 用户是否能读取某个旅行（IDOR 防护）——委托统一中间层 */
export async function canReadTravel(userId: number | null, travelId: number): Promise<boolean> {
  const travel = await prisma.travel.findUnique({
    where: { id: travelId },
    select: { ownerId: true, spaceId: true, visibility: true, isPublic: true },
  })
  if (!travel) return false
  return canViewResource('Travel', travel, userId)
}

/** 用户是否能读取某个媒体（IDOR 防护）——委托统一中间层 */
export async function canReadMedia(userId: number | null, mediaId: number): Promise<boolean> {
  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { userId: true, spaceId: true, visibility: true, isPublic: true },
  })
  if (!media) return false
  return canViewResource('Media', media, userId)
}
