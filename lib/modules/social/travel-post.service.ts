/**
 * TravelPost：公开旅行帖子（Stage 2.1/2.2 发布/同步服务）
 * - Travel 与 TravelPost 解耦：用户公开的是 TravelPost，不是整个 Space。
 * - 以 Travel.visibility === 'PUBLIC'（或旧 isPublic=true）为「公开」判定。
 * - syncTravelPost 幂等：公开则 upsert，非公开则删除。
 */
import { prisma } from '../../db'
import type { Prisma } from '@prisma/client'
import { isPublishedToCircle } from './social-permissions'
import { storageKeyToUrl, absoluteMediaUrl } from '../../media-url'

/**
 * 事务客户端（P1-15）：travel.service 的 create/update/delete 会把
 * `prisma.$transaction` 的 tx 透传进来，使「Travel 行 + TravelPost 投影」同事务。
 * 所有导出函数保持向后兼容：不传 tx 时行为与拆分前完全一致（走全局 prisma）。
 */
type TxClient = Prisma.TransactionClient

function toIso(v: Date | null | undefined): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** 解析 TravelPost 的作者 ID：优先 Travel.ownerId，其次 Space 的 OWNER 成员，最后首个用户 */
async function resolveAuthorId(
  spaceId: number | null,
  ownerId: number | null,
  db: TxClient | typeof prisma = prisma,
): Promise<number | null> {
  if (ownerId) return ownerId
  if (spaceId) {
    const owner = await db.spaceMember.findFirst({
      where: { spaceId, role: 'OWNER', status: 'ACTIVE' },
      select: { userId: true },
    })
    if (owner?.userId) return owner.userId
  }
  const first = await db.user.findFirst({ orderBy: { id: 'asc' }, select: { id: true } })
  return first?.id ?? null
}

export interface TravelPostSyncResult {
  id: number
  published: boolean
}

/** 幂等同步：根据当前 Travel 可见性决定创建/更新/删除 TravelPost（可传入事务客户端） */
export async function syncTravelPost(travelId: number, tx?: TxClient): Promise<TravelPostSyncResult | null> {
  const db = tx ?? prisma
  const travel = await db.travel.findUnique({
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
    // 取消公开：失败必须让事务回滚（老实现 .catch(() => {}) 会留下"帖子还在但旅行已私密"的不一致）
    await db.travelPost.deleteMany({ where: { travelId } })
    return null
  }

  const authorId = await resolveAuthorId(travel.spaceId, travel.ownerId, db)
  const summary = travel.description ?? null
  const coverMediaId = travel.coverMediaId ?? null

  const existing = await db.travelPost.findUnique({ where: { travelId } })
  if (existing) {
    await db.travelPost.update({
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
  const created = await db.travelPost.create({
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
export async function publishTravelPost(travelId: number, tx?: TxClient): Promise<TravelPostSyncResult | null> {
  return syncTravelPost(travelId, tx)
}

/** 取消公开（移除旅行圈）；失败向上抛，由调用方决定是否阻断（P1-15 去静默） */
export async function unpublishTravelPost(travelId: number, tx?: TxClient): Promise<void> {
  const db = tx ?? prisma
  await db.travelPost.deleteMany({ where: { travelId } })
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
      ? storageKeyToUrl(row.travel.coverMedia.storageKey)
      : absoluteMediaUrl(row.travel?.cover ?? null),
    publishedAt: toIso(row.publishedAt),
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    favoriteCount: row.favoriteCount,
  }
}

/** 将公开的旧 Post（文章）同步到旅行圈；非 travel / 未发布 / 未公开则移除 */
export async function syncPublicPostToCircle(postId: number): Promise<TravelPostSyncResult | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      userId: true,
      type: true,
      title: true,
      summary: true,
      location: true,
      date: true,
      published: true,
      isPublic: true,
    },
  })
  if (!post) return null

  if (post.type !== 'travel' || !post.published || !post.isPublic) {
    // 历史上这里静默吞错：清理失败没有日志，帖子会一直挂在旅行圈里
    try {
      await prisma.travelPost.deleteMany({ where: { postId } })
    } catch (err) {
      console.error('[travel-post.syncPublicPostToCircle] TravelPost 清理失败', { postId, err })
    }
    return null
  }

  const authorId = post.userId ?? (await resolveAuthorId(null, post.userId))
  const summary = post.summary ?? null
  const publishedAt = post.date ? new Date(post.date) : new Date()

  const existing = await prisma.travelPost.findUnique({ where: { postId } })
  if (existing) {
    await prisma.travelPost.update({
      where: { postId },
      data: { title: post.title, summary, visibility: 'PUBLIC', publishedAt, ...(authorId ? { authorId } : {}) },
    })
    return { id: existing.id, published: true }
  }

  if (!authorId) return null
  const created = await prisma.travelPost.create({
    data: {
      postId,
      authorId,
      visibility: 'PUBLIC',
      title: post.title,
      summary,
      publishedAt,
    },
  })
  return { id: created.id, published: true }
}

export async function unpublishPublicPost(postId: number): Promise<void> {
  try {
    await prisma.travelPost.deleteMany({ where: { postId } })
  } catch (err) {
    console.error('[travel-post.unpublishPublicPost] TravelPost 清理失败', { postId, err })
  }
}

// ============================================================
// 内容管理 2.0：把「文章可见性(Post.isPublic)」与「旅行圈分享」解耦。
// 分享状态的事实来源 = TravelPost 记录是否存在；由用户显式动作驱动，
// 不再由 isPublic 变化自动触发（见 post-service.updatePost/createPost）。
// ============================================================
export interface SharePostToCircleInput {
  travelId?: number | null
  visibility?: 'PUBLIC' | 'SPACE'
}

/**
 * 显式「分享到旅行圈」：只要求文章已发布；不要求公开（私密文章也可分享出公开副本）。
 * - 复用 TravelPost 作为旅行圈公开副本（独立于文章本身的可见性）。
 * - 幂等：已分享则更新，未分享则创建。
 */
export async function sharePostToCircle(
  postId: number,
  opts: SharePostToCircleInput = {},
): Promise<TravelPostSyncResult | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true, userId: true, type: true, title: true, summary: true, date: true, published: true,
    },
  })
  if (!post) throw new Error('文章不存在')
  if (post.type !== 'travel') throw new Error('仅旅行记录可分享到旅行圈')
  if (!post.published) throw new Error('请先发布文章，再分享到旅行圈')

  const authorId = post.userId ?? (await resolveAuthorId(null, post.userId))
  const summary = post.summary ?? null
  const publishedAt = post.date ? new Date(post.date) : new Date()
  const travelId = opts.travelId ?? null
  const visibility = opts.visibility || 'PUBLIC'

  const existing = await prisma.travelPost.findUnique({ where: { postId } })
  if (existing) {
    await prisma.travelPost.update({
      where: { postId },
      data: {
        title: post.title,
        summary,
        visibility,
        publishedAt,
        travelId,
        ...(authorId ? { authorId } : {}),
      },
    })
    return { id: existing.id, published: true }
  }

  if (!authorId) return null
  const created = await prisma.travelPost.create({
    data: {
      postId,
      authorId,
      visibility,
      title: post.title,
      summary,
      publishedAt,
      travelId,
    },
  })
  return { id: created.id, published: true }
}

/** 取消分享（移除旅行圈），保留文章本身 */
export async function unsharePost(postId: number): Promise<void> {
  try {
    await prisma.travelPost.deleteMany({ where: { postId } })
  } catch (err) {
    console.error('[travel-post.unsharePost] TravelPost 清理失败', { postId, err })
  }
}
