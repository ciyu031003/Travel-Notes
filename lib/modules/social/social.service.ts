/**
 * Social 业务服务（Stage 2.3）：
 * Feed（推荐/最新/热门/关注）、帖子详情、点赞/收藏、评论/回复、评论点赞、
 * 关注/粉丝、屏蔽、通知、举报、我的收藏。
 * 所有互动走唯一约束 + 事务维护反规范化计数，幂等。
 */
import { prisma } from '../../db'
import { checkContent } from '../content/policy'
import { appCache } from '../../cache'
import { absoluteMediaUrl } from '../../media-url'

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
  post: {
    select: { id: true, slug: true, cover: true, images: true, location: true, date: true },
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
    return absoluteMediaUrl(base + '/' + storageKey) ?? (base + '/' + storageKey)
  }
  return absoluteMediaUrl('/uploads/' + storageKey) ?? ('/uploads/' + storageKey)
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
    avatarUrl: absoluteMediaUrl(author.avatarUrl),
    accountId: author.accountId ?? null,
  }
}

function postImages(post: any): string[] {
  let raw: string[] = []
  if (!post) return raw
  if (Array.isArray(post.images)) raw = post.images.filter((v: any) => typeof v === 'string')
  else if (typeof post.images === 'string') {
    try {
      const parsed = JSON.parse(post.images)
      if (Array.isArray(parsed)) raw = parsed.filter((v: any) => typeof v === 'string')
    } catch {}
  }
  return raw.map((u) => absoluteMediaUrl(u) ?? u)
}

function serializePost(row: any, likedIds: Set<number>, favoriteIds: Set<number>) {
  const travel = row.travel ?? null
  const post = row.post ?? null
  const photos = post ? postImages(post) : []
  const coverUrl = absoluteMediaUrl(post ? (post.cover || photos[0] || null) : travelCoverUrl(travel))
  return {
    id: row.id,
    travelId: row.travelId ?? null,
    title: row.title,
    summary: row.summary,
    coverUrl,
    location: travel?.location ?? post?.location ?? null,
    startDate: iso(travel?.startDate ?? post?.date),
    endDate: iso(travel?.endDate ?? post?.date),
    dayCount: travel?._count?.days ?? (post ? 1 : 0),
    photoCount: travel?._count?.memories ?? photos.length,
    travelType: travel?.travelType ?? null,
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
  // 阶段 A · A3：候选 + 评分结果内存缓存 60s，避免每个请求都重算 500 条热度排序
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000)
  const feedCacheKey = `social:feed:recommended:u${userId ?? 'anon'}`
  const cachedScored = await appCache.get<Array<{ p: any; score: number }>>(feedCacheKey)
  let scored: Array<{ p: any; score: number }>
  if (cachedScored) {
    scored = cachedScored
  } else {
    const candidates = await prisma.travelPost.findMany({
      where: { ...baseWhere, publishedAt: { gte: since } },
      include: POST_INCLUDE,
      orderBy: { publishedAt: 'desc' },
      take: 500,
    })
    scored = candidates
      .map((p) => ({ p, score: heatScore(p) }))
      .sort((a, b) => b.score - a.score)
    await appCache.set(feedCacheKey, scored, 60_000)
  }
  const total = scored.length
  const slice = scored.slice((page - 1) * pageSize, page * pageSize).map((s) => s.p)
  const data = await attachViewerState(slice, userId)
  return { data, total, page, pageSize, hasMore: page * pageSize < total }
}

/**
 * 回忆照片的 include 形状（只在两处复用：公开帖照片收集、详情按天数据）。
 *
 * ⚠️ 这里**不能**在两层嵌套的 relation 上再加 `where`
 * （`mediaLinks: { include: { media: { where: ... } } }`）——
 * Prisma 会抛 `Unknown argument 'where'`，而调用方如果 catch 成空数组，
 * 表现就是"详情页看不到任何按天内容"，日志里却什么都没有。
 * 类型过滤（`type: 'IMAGE'`）改在 JS 侧做，反正一个回忆的照片数量很小。
 */
const memoryPhotosInclude: any = {
  media: { orderBy: { id: 'asc' } },
  mediaLinks: { include: { media: true } },
}

/** 只保留图片类型（原先把 `type: 'IMAGE'` 写在 where 里，见上面的说明） */
function imagesOf(rows: any[] | undefined): any[] {
  return (rows || []).filter((m: any) => m && m.type === 'IMAGE' && m.storageKey)
}

/**
 * 收集某本旅行下的**公开**照片（封面 + 公开回忆的主图与关联图，去重）。
 *
 * `Memory.visibility` 由创建流程决定（**私密回忆不该出现在公开帖里**），
 * 这里显式只取 `PUBLIC` —— 不依赖"旅行公开所以里面全公开"的隐含假设。
 */
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
      orderBy: [{ happenedAt: 'asc' }, { id: 'asc' }],
      include: memoryPhotosInclude,
    })
    for (const m of memories) {
      const keys = [
        ...imagesOf((m as any).media).map((x: any) => x.storageKey),
        ...imagesOf(((m as any).mediaLinks || []).map((l: any) => l?.media)).map((x: any) => x.storageKey),
      ]
      for (const key of keys) {
        if (!key) continue
        const u = mediaUrl(key)
        if (!urls.includes(u)) urls.push(u)
      }
    }
  } catch {
    // 照片收集失败不影响帖子详情返回
  }
  return urls
}

/**
 * 详情页的**按天**游记数据（R2）。
 *
 * 为什么需要：`/circle/<id>` 原先只有封面 + 一段摘要 + 照片墙，别人点进来
 * **看不到「旅行」本身** —— 没有每天的行程与回忆，这正是"点开别人的旅行却看不到内容"的实质。
 *
 * 与 `travel.service.getTravelTimeline` 口径一致（天 → 行程 → 回忆 → 照片），
 * 但这里是**发布态**，照片只取公开回忆（`Memory.visibility = PUBLIC`）与旅行封面，
 * 私密回忆一律不下发 —— 不依赖"旅行公开所以里面全公开"这种隐含假设。
 */
export interface PublicTripDay {
  date: string | null
  title: string | null
  summary: string | null
  itinerary: { id: number; title: string; type: string; startTime: string | null; locationName: string | null }[]
  memories: { id: number; title: string; content: string | null; mood: string | null; photos: { id: number; url: string }[] }[]
  photos: { id: number; url: string }[]
}

export async function getPublicTripDays(travelId: number): Promise<PublicTripDay[]> {
  const days = await prisma.travelDay.findMany({
    where: { travelId },
    orderBy: { sortOrder: 'asc' },
    include: {
      itineraryItems: {
        orderBy: { sortOrder: 'asc' },
        include: { location: { select: { name: true } } },
      },
      memories: {
        where: { visibility: 'PUBLIC' },
        orderBy: [{ happenedAt: 'asc' }, { id: 'asc' }],
        include: memoryPhotosInclude,
      },
    } as any,
  })

  return days.map((d: any) => {
    const memories = (d.memories || []).map((mem: any) => {
      const primary = imagesOf(mem.media).map((m: any) => ({ id: m.id, url: mediaUrl(m.storageKey) }))
      const linked = imagesOf((mem.mediaLinks || []).map((l: any) => l?.media)).map((m: any) => ({
        id: m.id,
        url: mediaUrl(m.storageKey),
      }))
      const seen = new Set<number>()
      const photos = [...primary, ...linked].filter((p: any) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
      return {
        id: mem.id,
        title: mem.title,
        content: mem.content ?? null,
        mood: mem.mood ?? null,
        photos,
      }
    })
    // 当天的照片 = 当天公开回忆的照片去重（与时间线口径一致）
    const seen = new Set<number>()
    const photos = memories
      .flatMap((m: any) => m.photos)
      .filter((p: any) => (seen.has(p.id) ? false : (seen.add(p.id), true)))

    return {
      date: iso(d.date),
      title: d.title ?? null,
      summary: d.summary ?? null,
      itinerary: (d.itineraryItems || []).map((it: any) => ({
        id: it.id,
        title: it.title,
        type: it.type,
        startTime: iso(it.startTime),
        locationName: it.location?.name ?? null,
      })),
      memories,
      photos,
    }
  })
}

export async function getSocialPost(id: number, userId?: number | null) {
  const row: any = await prisma.travelPost.findUnique({ where: { id }, include: POST_INCLUDE })
  if (!row) return null
  if (row.visibility !== 'PUBLIC' && row.authorId !== userId) return null
  const [post] = await attachViewerState([row], userId)

  // 按天游记：只有绑定 Travel 的帖子才有（历史 Post 来源没有天数据）。
  // 查询失败时降级为空数组（详情页其余部分照常可读），但**必须留日志** ——
  // 先前这里静默 catch，把一个 `Unknown argument 'where'` 变成了"页面没内容、日志也干净"，
  // 排查花了好几轮。降级可以，静默不可以。
  const days = row.travelId
    ? await getPublicTripDays(row.travelId).catch((e) => {
        console.error('[social] 按天游记加载失败（详情页将只显示封面与摘要）:', (e as Error)?.message || e)
        return []
      })
    : []

  return {
    ...post,
    postId: row.postId ?? null,
    canEdit: row.authorId != null && userId != null && row.authorId === userId,
    slug: row.travel?.slug ?? row.post?.slug ?? null,
    photos: row.post ? postImages(row.post) : row.travelId ? await collectTravelPhotos(row.travelId) : [],
    days,
    /** 是否可给建议（R4 用）：公开帖登录后可评论；空间帖需成员 —— 这里先给出登录态判断 */
    canSuggest: !!userId,
  }
}

/** 编辑公开旅行帖（仅作者本人）：同步更新 TravelPost 与底层 Post/Travel 的标题与摘要。 */
export async function updateSocialPost(
  id: number,
  userId: number,
  input: { title?: string; summary?: string },
) {
  const row: any = await prisma.travelPost.findUnique({ where: { id } })
  if (!row) return null
  if (row.authorId !== userId) return null

  const title = input.title !== undefined ? String(input.title).trim().slice(0, 255) : undefined
  const summary = input.summary !== undefined
    ? String(input.summary).trim()
    : undefined

  if (title !== undefined && !title) throw new Error('标题不能为空')

  const data: { title?: string; summary?: string | null } = {}
  if (title !== undefined) data.title = title
  if (summary !== undefined) data.summary = summary || null
  if (Object.keys(data).length === 0) return getSocialPost(id, userId)

  await prisma.travelPost.update({ where: { id }, data })

  // 同步底层数据源，保证后续 feed / 详情刷新后仍一致。
  if (row.postId) {
    const postData: { title?: string; summary?: string | null } = {}
    if (title !== undefined) postData.title = title
    if (summary !== undefined) postData.summary = summary || null
    await prisma.post.update({ where: { id: row.postId }, data: postData }).catch(() => {})
  }
  if (row.travelId) {
    const travelData: { title?: string; description?: string | null } = {}
    if (title !== undefined) travelData.title = title
    if (summary !== undefined) travelData.description = summary || null
    await prisma.travel.update({ where: { id: row.travelId }, data: travelData }).catch(() => {})
  }

  return getSocialPost(id, userId)
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
  // v3.1 M3-B3：统一内容策略（长度/敏感词/外链限制）
  const check = checkContent(content, { maxLength: 1000, maxLinks: 0 })
  if (!check.ok) throw new Error(check.reason || '评论内容不合法')
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
  // 阶段 A · A3：帖子/粉丝/关注三个 count 合并进 user 查询的 _count（过滤计数），
  // 从 3 次 count 降为 0 次额外查询（isFollowing/isBlocked 仍按需单独查）。
  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true, username: true, nickname: true, avatarUrl: true, accountId: true, createdAt: true,
      _count: {
        select: {
          travelPosts: { where: { visibility: 'PUBLIC' } },
          followers: true,
          following: true,
        },
      },
    },
  })
  if (!user) return null
  const [isFollowing, isBlocked] = await Promise.all([
    viewerId ? prisma.userFollow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: targetId } } }) : Promise.resolve(null),
    viewerId ? prisma.userBlock.findUnique({ where: { blockerId_blockedId: { blockerId: viewerId, blockedId: targetId } } }) : Promise.resolve(null),
  ])
  const postCount = user._count.travelPosts
  const followerCount = user._count.followers
  const followingCount = user._count.following
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
