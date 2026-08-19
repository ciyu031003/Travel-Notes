/**
 * TravelPost：公开旅行帖子（Stage 2.1/2.2 发布/同步服务）
 * - Travel 与 TravelPost 解耦：用户公开的是 TravelPost，不是整个 Space。
 * - 以 Travel.visibility === 'PUBLIC'（或旧 isPublic=true）为「公开」判定。
 * - syncTravelPost 幂等：公开则 upsert，非公开则删除。
 */
import { prisma } from '../../db'
import { isPublishedToCircle } from './social-permissions'

function toIso(v: Date | null | undefined): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** 解析 TravelPost 的作者 ID：优先 Travel.ownerId，其次 Space 的 OWNER 成员，最后首个用户 */
async function resolveAuthorId(spaceId: number | null, ownerId: number | null): Promise<number | null> {
  if (ownerId) return ownerId
  if (spaceId) {
    const owner = await prisma.spaceMember.findFirst({
      where: { spaceId, role: 'OWNER', status: 'ACTIVE' },
      select: { userId: true },
    })
    if (owner?.userId) return owner.userId
  }
  const first = await prisma.user.findFirst({ orderBy: { id: 'asc' }, select: { id: true } })
  return first?.id ?? null
}

export interface TravelPostSyncResult {
  id: number
  published: boolean
}

/** 幂等同步：根据当前 Travel 可见性决定创建/更新/删除 TravelPost */
export async function syncTravelPost(travelId: number): Promise<TravelPostSyncResult | null> {
  const travel = await prisma.travel.findUnique({
    where: { id: travelId },
    select: {
      id: true,
      spaceId: true,
      ownerId: true,
      visibility: true,
      isPublic: true,
      title: true,
      description: true,
      coverMediaId: true,
    },
  })
  if (!travel) return null

  if (!isPublishedToCircle(travel)) {
    await prisma.travelPost.deleteMany({ where: { travelId } }).catch(() => {})
    return null
  }

  const authorId = await resolveAuthorId(travel.spaceId, travel.ownerId)
  const summary = travel.description ?? null
  const coverMediaId = travel.coverMediaId ?? null

  const existing = await prisma.travelPost.findUnique({ where: { travelId } })
  if (existing) {
    await prisma.travelPost.update({
      where: { travelId },
      data: {
        title: travel.title,
        summary,
        coverMediaId,
        visibility: 'PUBLIC',
        ...(authorId ? { authorId } : {}),
      },
    })
    return { id: existing.id, published: true }
  }

  if (!authorId) return null
  const created = await prisma.travelPost.create({
    data: {
      travelId,
      authorId,
      visibility: 'PUBLIC',
      title: travel.title,
      summary,
      coverMediaId,
    },
  })
  return { id: created.id, published: true }
}

/** 公开到旅行圈 */
export async function publishTravelPost(travelId: number): Promise<TravelPostSyncResult | null> {
  return syncTravelPost(travelId)
}

/** 取消公开（移除旅行圈） */
export async function unpublishTravelPost(travelId: number): Promise<void> {
  await prisma.travelPost.deleteMany({ where: { travelId } }).catch(() => {})
}

/** 按 Travel ID 取公开帖子 */
export async function getTravelPostByTravelId(travelId: number) {
  return prisma.travelPost.findUnique({
    where: { travelId },
    include: {
      author: { select: { id: true, username: true } },
      travel: {
        include: {
          coverMedia: true,
          _count: { select: { memories: true } },
        },
      },
    },
  })
}

/** 将帖子行映射为对外安全的摘要结构（供下一阶段 Feed API 复用） */
export function serializeTravelPost(row: any) {
  return {
    id: row.id,
    travelId: row.travelId,
    author: row.author
      ? { id: row.author.id, username: row.author.username }
      : null,
    title: row.title,
    summary: row.summary,
    coverUrl: row.travel?.coverMedia?.storageKey
      ? '/' + row.travel.coverMedia.storageKey.replace(/^\/+/, '')
      : row.travel?.cover ?? null,
    publishedAt: toIso(row.publishedAt),
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    favoriteCount: row.favoriteCount,
  }
}
