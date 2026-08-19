/**
 * Social 业务服务（Stage 2.3）：
 * Feed（推荐/最新/热门/关注）、帖子详情、点赞/收藏、评论/回复、评论点赞、
 * 关注/粉丝、屏蔽、通知、举报、我的收藏。
 * 所有互动走唯一约束 + 事务维护反规范化计数，幂等。
 */
import { prisma } from '../../db'

export type SocialFeedTab = 'recommended' | 'latest' | 'hot' | 'following'
export type NotificationTypeName = 'LIKE' | 'COMMENT' | 'REPLY' | 'FAVORITE' | 'FOLLOW'

const POST_INCLUDE: any = {
  author: { select: { id: true, username: true, nickname: true, avatarUrl: true, accountId: true } },
  travel: {
    include: {
      coverMedia: true,
      _count: { select: { days: true, memories: true } },
    },
  },
}

function iso(v: Date | string | null | undefined): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function mediaUrl(storageKey: string): string {
  if (process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET) {
    const base = (process.env.STORAGE_PUBLIC_BASE_URL || process.env.STORAGE_ENDPOINT).replace(/\/+$/, '')
    return base + '/' + storageKey
  }
  return '/uploads/' + storageKey
}

function travelCoverUrl(travel: any): string | null {
  if (travel?.coverMedia?.storageKey) return mediaUrl(travel.coverMedia.storageKey)
  if (travel?.cover) return String(travel.cover)
  return null
}

function serializeAuthor(author: any) {
  if (!author) return null
  return {
    id: author.id,
    username: author.username,
    nickname: author.nickname ?? null,
    avatarUrl: author.avatarUrl ?? null,
    accountId: author.accountId ?? null,
  }
}

function serializePost(row: any, likedIds: Set<number>, favoriteIds: Set<number>) {
  const travel = row.travel ?? null
  return {
    id: row.id,
    travelId: row.travelId,
    title: row.title,
    summary: row.summary,
    coverUrl: travelCoverUrl(travel),
    location: travel?.location ?? null,
    startDate: iso(travel?.startDate),
    endDate: iso(travel?.endDate),
    dayCount: travel?._count?.days ?? 0,
    photoCount: travel?._count?.memories ?? 0,
    author: serializeAuthor(row.author),
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    favoriteCount: row.favoriteCount,
    publishedAt: iso(row.publishedAt),
    isLiked: likedIds.has(row.id),
    isFavorited: favoriteIds.has(row.id),
  }
}

async function attachViewerState(rows: any[], userId: number | null | undefined) {
  const ids = rows.map((r) => r.id)
  let likedIds = new Set<number>()
  let favoriteIds = new Set<number>()
  if (userId && ids.length) {
    const [likes, favs] = await Promise.all([
      prisma.postLike.findMany({ where: { userId, postId: { in: ids } }, select: { postId: true } }),
      prisma.postFavorite.findMany({ where: { userId, postId: { in: ids } }, select: { postId: true } }),
    ])
    likedIds = new Set(likes.map((l) => l.postId))
    favoriteIds = new Set(favs.map((f) => f.postId))
  }
  return rows.map((r) => serializePost(r, likedIds, favoriteIds))
}

function heatScore(p: any): number {
  const publishedAt = new Date(p.publishedAt).getTime()
  const ageHours = Math.max(0, (Date.now() - publishedAt) / 3600000)
  const freshness = 1 / (1 + ageHours / 72)
  return (p.likeCount * 1 + p.commentCount * 3 + p.favoriteCount * 4 + 1) * freshness
}

async function blockedAuthorIds(userId: number): Promise<number[]> {
  const rows = await prisma.userBlock.findMany({ where: { blockerId: userId }, select: { blockedId: true } })
  return rows.map((r) => r.blockedId)
}

export interface SocialFeedResult {
  data: any[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export async function listSocialFeed(params: {
  tab?: SocialFeedTab
  userId?: number | null
  page?: number
  pageSize?: number
}): Promise<SocialFeedResult> {
  const tab = params.tab ?? 'recommended'
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  const userId = params.userId ?? null

  const baseWhere: any = { visibility: 'PUBLIC' }
  if (userId) {
    const blocked = await blockedAuthorIds(userId)
    if (blocked.length) baseWhere.authorId = { notIn: blocked }
  }

  if (tab === 'following') {
    if (!userId) return { data: [], total: 0, page, pageSize, hasMore: false }
    const follows = await prisma.userFollow.findMany({ where: { followerId: userId }, select: { followingId: true } })
    const ids = follows.map((f) => f.followingId)
    if (!ids.length) return { data: [], total: 0, page, pageSize, hasMore: false }
    const where = { ...baseWhere, authorId: { in: ids } }
    const total = await prisma.travelPost.count({ where })
    const rows = await prisma.travelPost.findMany({ where, include: POST_INCLUDE, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize })
    const data = await attachViewerState(rows, userId)
    return { data, total, page, pageSize, hasMore: page * pageSize < total }
  }

  if (tab === 'latest' || tab === 'hot') {
    const orderBy: any = tab === 'latest'
      ? [{ publishedAt: 'desc' }, { id: 'desc' }]
      : [{ likeCount: 'desc' }, { commentCount: 'desc' }, { favoriteCount: 'desc' }, { id: 'desc' }]
    const total = await prisma.travelPost.count({ where: baseWhere })
    const rows = await prisma.travelPost.findMany({ where: baseWhere, include: POST_INCLUDE, orderBy, skip: (page - 1) * pageSize, take: pageSize })
    const data = await attachViewerState(rows, userId)
    return { data, total, page, pageSize, hasMore: page * pageSize < total }
  }

  // recommended：近 90 天候选按热度分排序（第一版简单算法）
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000)
  const candidates = await prisma.travelPost.findMany({
    where: { ...baseWhere, publishedAt: { gte: since } },
    include: POST_INCLUDE,
    orderBy: { publishedAt: 'desc' },
    take: 500,
  })
  const scored = candidates
    .map((p) => ({ p, score: heatScore(p) }))
    .sort((a, b) => b.score - a.score)
  const total = scored.length
  const slice = scored.slice((page - 1) * pageSize, page * pageSize).map((s) => s.p)
  const data = await attachViewerState(slice, userId)
  return { data, total, page, pageSize, hasMore: page * pageSize < total }
}

async function collectTravelPhotos(travelId: number): Promise<string[]> {
  const urls: string[] = []
  try {
    const travel = await prisma.travel.findUnique({
      where: { id: travelId },
      select: { coverMedia: true, cover: true },
    })
    if (travel?.coverMedia?.storageKey) urls.push(mediaUrl(travel.coverMedia.storageKey))
    else if (travel?.cover) urls.push(String(travel.cover))

    const memories = await prisma.memory.findMany({
      where: { travelId, visibility: 'PUBLIC' },
      orderBy: { happenedAt: 'asc' },
      include: { media: { where: { type: 'IMAGE' }, orderBy: { id: 'asc' } } },
    })
    for (const m of memories) {
      for (const media of m.media) {
        if (media.storageKey) {
          const u = mediaUrl(media.storageKey)
          if (!urls.includes(u)) urls.push(u)
        }
      }
    }
  } catch {
    // 照片收集失败不影响帖子详情返回
  }
  return urls
}

export async function getSocialPost(id: number, userId?: number | null) {
  const row: any = await prisma.travelPost.findUnique({ where: { id }, include: POST_INCLUDE })
  if (!row) return null
  if (row.visibility !== 'PUBLIC' && row.authorId !== userId) return null
  const [post] = await attachViewerState([row], userId)
  return {
    ...post,
    slug: row.travel?.slug ?? null,
    photos: await collectTravelPhotos(row.travelId),
  }
}

async function notify(recipientId: number | null, actorId: number, type: NotificationTypeName, refType: string, refId: number) {
  if (!recipientId || recipientId === actorId) return
  await prisma.notification.create({ data: { userId: recipientId, actorId, type, refType, refId } }).catch(() => {})
}

export async function togglePostLike(postId: number, userId: number) {
  const post = await prisma.travelPost.findUnique({ where: { id: postId }, select: { id: true, authorId: true } })
  if (!post) throw new Error('帖子不存在')
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.postLike.findUnique({ where: { postId_userId: { postId, userId } } })
    if (existing) {
      await tx.postLike.delete({ where: { id: existing.id } })
      const p = await tx.travelPost.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } })
      return { liked: false, likeCount: Math.max(0, p.likeCount) }
    }
    await tx.postLike.create({ data: { postId, userId } })
    const p = await tx.travelPost.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } })
    return { liked: true, likeCount: p.likeCount }
  })
  if (result.liked) await notify(post.authorId, userId, 'LIKE', 'TravelPost', postId)
  return result
}

export async function togglePostFavorite(postId: number, userId: number) {
  const post = await prisma.travelPost.findUnique({ where: { id: postId }, select: { id: true, authorId: true } })
  if (!post) throw new Error('帖子不存在')
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.postFavorite.findUnique({ where: { postId_userId: { postId, userId } } })
    if (existing) {
      await tx.postFavorite.delete({ where: { id: existing.id } })
      const p = await tx.travelPost.update({ where: { id: postId }, data: { favoriteCount: { decrement: 1 } } })
      return { favorited: false, favoriteCount: Math.max(0, p.favoriteCount) }
    }
    await tx.postFavorite.create({ data: { postId, userId } })
    const p = await tx.travelPost.update({ where: { id: postId }, data: { favoriteCount: { increment: 1 } } })
    return { favorited: true, favoriteCount: p.favoriteCount }
  })
  if (result.favorited) await notify(post.authorId, userId, 'FAVORITE', 'TravelPost', postId)
  return result
}

function serializeComment(row: any, likedIds: Set<number>) {
  return {
    id: row.id,
    postId: row.postId,
    userId: row.userId,
    parentId: row.parentId,
    content: row.content,
    status: row.status,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    author: serializeAuthor(row.user),
    likeCount: row._count?.likes ?? 0,
    isLiked: likedIds.has(row.id),
  }
}

export async function listPostComments(postId: number, userId?: number | null) {
  const post = await prisma.travelPost.findUnique({ where: { id: postId }, select: { id: true } })
  if (!post) throw new Error('帖子不存在')
  const rows = await prisma.comment.findMany({
    where: { postId, status: 'VISIBLE' },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, username: true, nickname: true, avatarUrl: true, accountId: true } }, _count: { select: { likes: true } } },
  })
  const ids = rows.map((r) => r.id)
  let likedIds = new Set<number>()
  if (userId && ids.length) {
    const likes = await prisma.commentLike.findMany({ where: { userId, commentId: { in: ids } }, select: { commentId: true } })
    likedIds = new Set(likes.map((l) => l.commentId))
  }
  const comments = rows.map((r) => serializeComment(r, likedIds))
  const top = comments.filter((c) => !c.parentId)
  const byParent = new Map<number, any[]>()
  for (const c of comments) {
    if (c.parentId) {
      const list = byParent.get(c.parentId) || []
      list.push(c)
      byParent.set(c.parentId, list)
    }
  }
  return top.map((c) => ({ ...c, replies: byParent.get(c.id) || [] }))
}

export async function createPostComment(input: { postId: number; userId: number; content: string; parentId?: number | null }) {
  const content = (input.content || '').trim()
  if (!content) throw new Error('评论内容不能为空')
  if (content.length > 1000) throw new Error('评论最多 1000 字')
  const post = await prisma.travelPost.findUnique({ where: { id: input.postId }, select: { id: true, authorId: true } })
  if (!post) throw new Error('帖子不存在')

  let parentAuthorId: number | null = null
  if (input.parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: input.parentId }, select: { id: true, postId: true, userId: true, status: true } })
    if (!parent || parent.postId !== input.postId || parent.status !== 'VISIBLE') throw new Error('回复的评论不存在')
    parentAuthorId = parent.userId
  }

  const id = await prisma.$transaction(async (tx) => {
    const c = await tx.comment.create({ data: { postId: input.postId, userId: input.userId, parentId: input.parentId ?? null, content, status: 'VISIBLE' } })
    await tx.travelPost.update({ where: { id: input.postId }, data: { commentCount: { increment: 1 } } })
    return c.id
  })

  if (input.parentId && parentAuthorId) await notify(parentAuthorId, input.userId, 'REPLY', 'Comment', id)
  else await notify(post.authorId, input.userId, 'COMMENT', 'TravelPost', input.postId)

  const created = await prisma.comment.findUnique({ where: { id }, include: { user: { select: { id: true, username: true, nickname: true, avatarUrl: true, accountId: true } }, _count: { select: { likes: true } } } })
  return serializeComment(created, new Set())
}

export async function deletePostComment(commentId: number, userId: number) {
  const c = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true, userId: true, postId: true, status: true } })
  if (!c) throw new Error('评论不存在')
  if (c.userId !== userId) throw new Error('无权删除该评论')
  if (c.status !== 'DELETED') {
    await prisma.$transaction(async (tx) => {
      await tx.comment.update({ where: { id: commentId }, data: { status: 'DELETED' } })
      await tx.travelPost.update({ where: { id: c.postId }, data: { commentCount: { decrement: 1 } } })
    })
  }
  return { deleted: true }
}

export async function toggleCommentLike(commentId: number, userId: number) {
  const c = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true } })
  if (!c) throw new Error('评论不存在')
  const existing = await prisma.commentLike.findUnique({ where: { commentId_userId: { commentId, userId } } })
  if (existing) {
    await prisma.commentLike.delete({ where: { id: existing.id } })
    return { liked: false }
  }
  await prisma.commentLike.create({ data: { commentId, userId } })
  return { liked: true }
}

export async function followUser(actorId: number, targetId: number) {
  if (actorId === targetId) throw new Error('不能关注自己')
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } })
  if (!target) throw new Error('用户不存在')
  await prisma.userFollow.upsert({
    where: { followerId_followingId: { followerId: actorId, followingId: targetId } },
    update: {},
    create: { followerId: actorId, followingId: targetId },
  })
  await notify(targetId, actorId, 'FOLLOW', 'User', targetId)
  return { following: true }
}

export async function unfollowUser(actorId: number, targetId: number) {
  await prisma.userFollow.deleteMany({ where: { followerId: actorId, followingId: targetId } })
  return { following: false }
}

export async function blockUser(actorId: number, targetId: number) {
  if (actorId === targetId) throw new Error('不能屏蔽自己')
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } })
  if (!target) throw new Error('用户不存在')
  await prisma.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId: actorId, blockedId: targetId } },
    update: {},
    create: { blockerId: actorId, blockedId: targetId },
  })
  return { blocked: true }
}

export async function unblockUser(actorId: number, targetId: number) {
  await prisma.userBlock.deleteMany({ where: { blockerId: actorId, blockedId: targetId } })
  return { blocked: false }
}

export async function getUserProfile(targetId: number, viewerId?: number | null) {
  const user = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, username: true, nickname: true, avatarUrl: true, accountId: true, createdAt: true } })
  if (!user) return null
  const [postCount, followerCount, followingCount, isFollowing, isBlocked] = await Promise.all([
    prisma.travelPost.count({ where: { authorId: targetId, visibility: 'PUBLIC' } }),
    prisma.userFollow.count({ where: { followingId: targetId } }),
    prisma.userFollow.count({ where: { followerId: targetId } }),
    viewerId ? prisma.userFollow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: targetId } } }) : Promise.resolve(null),
    viewerId ? prisma.userBlock.findUnique({ where: { blockerId_blockedId: { blockerId: viewerId, blockedId: targetId } } }) : Promise.resolve(null),
  ])
  const recent = await prisma.travelPost.findMany({ where: { authorId: targetId, visibility: 'PUBLIC' }, orderBy: { publishedAt: 'desc' }, take: 12, include: POST_INCLUDE })
  const posts = await attachViewerState(recent, viewerId)
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    accountId: user.accountId,
    createdAt: iso(user.createdAt),
    stats: { postCount, followerCount, followingCount },
    isFollowing: !!isFollowing,
    isBlocked: !!isBlocked,
    posts,
  }
}

export async function listFollowers(userId: number) {
  const rows = await prisma.userFollow.findMany({ where: { followingId: userId }, orderBy: { createdAt: 'desc' }, include: { follower: { select: { id: true, username: true, nickname: true, avatarUrl: true, accountId: true } } } })
  return rows.map((r) => ({ ...serializeAuthor(r.follower) }))
}

export async function listFollowing(userId: number) {
  const rows = await prisma.userFollow.findMany({ where: { followerId: userId }, orderBy: { createdAt: 'desc' }, include: { following: { select: { id: true, username: true, nickname: true, avatarUrl: true, accountId: true } } } })
  return rows.map((r) => ({ ...serializeAuthor(r.following) }))
}

export async function listNotifications(userId: number, page?: number, pageSize?: number) {
  const p = Math.max(1, page ?? 1)
  const ps = Math.min(100, Math.max(1, pageSize ?? 20))
  const where = { userId }
  const total = await prisma.notification.count({ where })
  const rows = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (p - 1) * ps,
    take: ps,
    include: { actor: { select: { id: true, username: true, nickname: true, avatarUrl: true, accountId: true } } },
  })
  const data = rows.map((r) => ({ id: r.id, type: r.type, refType: r.refType, refId: r.refId, read: r.read, createdAt: iso(r.createdAt), actor: serializeAuthor(r.actor) }))
  const unread = await prisma.notification.count({ where: { userId, read: false } })
  return { data, total, unread, page: p, pageSize: ps, hasMore: p * ps < total }
}

export async function markNotificationsRead(userId: number, ids?: number[]) {
  if (ids && ids.length) {
    await prisma.notification.updateMany({ where: { userId, id: { in: ids } }, data: { read: true } })
  } else {
    await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } })
  }
  return { ok: true }
}

export async function reportPost(postId: number, reporterId: number, reason: string) {
  const r = (reason || '').trim()
  if (!r) throw new Error('请填写举报原因')
  const post = await prisma.travelPost.findUnique({ where: { id: postId }, select: { id: true } })
  if (!post) throw new Error('帖子不存在')
  await prisma.report.upsert({
    where: { postId_reporterId: { postId, reporterId } },
    update: { reason: r, status: 'PENDING' },
    create: { postId, reporterId, reason: r },
  })
  return { reported: true }
}

export async function listMyFavorites(userId: number, page?: number, pageSize?: number) {
  const p = Math.max(1, page ?? 1)
  const ps = Math.min(100, Math.max(1, pageSize ?? 20))
  const total = await prisma.postFavorite.count({ where: { userId } })
  const favs = await prisma.postFavorite.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    skip: (p - 1) * ps,
    take: ps,
    include: { post: { include: POST_INCLUDE } },
  })
  const data = await attachViewerState(favs.map((f) => f.post), userId)
  return { data, total, page: p, pageSize: ps, hasMore: p * ps < total }
}
