import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ApiError } from '@/lib/api-response'
import { withAuth } from '@/lib/api/handler'
import { myActiveSpaceIds, spaceScopedWhere } from '@/lib/modules/access/space-scope'
import { scopedWhere } from '@/lib/visibility'

export const dynamic = 'force-dynamic'

/**
 * 增量同步端点（B4）：GET /api/sync/changes?updatedSince=<ISO 或毫秒时间戳>
 *
 * 返回 `{ serverTime, travels, moments, albums, memories, tombstones }`：
 *   · 各实体按 `updatedAt > since` 过滤（每类最多 500 条，按 updatedAt 升序），
 *     并按当前用户的可见性裁剪（自己的 / 公开的 / 所在空间内的）；
 *   · tombstones = 当前用户在 since 之后删除的实体（客户端据此删除本地行）；
 *   · serverTime 在查询**之前**取：查询期间写入的行 updatedAt 必然 > serverTime，
 *     客户端用 serverTime 作为下一轮游标不会漏更新。
 *
 * 客户端（lib/modules/offline/pull-dispatcher.ts）优先调用本端点；404/失败回退旧全量拉取。
 */
const LIMIT = 500

const TOMBSTONE_TYPES = ['Travel', 'Moment', 'Album', 'Memory'] as const

/** 同时接受 ISO 8601 与毫秒时间戳字符串（客户端 P2-29 游标是毫秒） */
function parseUpdatedSince(raw: string | null): Date {
  if (!raw || !raw.trim()) return new Date(0)
  const trimmed = raw.trim()
  const numeric = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(trimmed)
  if (Number.isNaN(date.getTime())) {
    throw new ApiError('INVALID_QUERY', 'updatedSince 格式不正确', 400)
  }
  if (date.getTime() > Date.now() + 60_000) {
    throw new ApiError('INVALID_QUERY', 'updatedSince 不能是未来时间', 400)
  }
  return date
}

/** Moment.tags 是 Text 列里的 JSON 数组；客户端期望数组（或 null），损坏数据按 null 处理 */
function parseTags(raw: string | null | undefined): string[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : null
  } catch {
    return null
  }
}

export const GET = withAuth(async (request, ctx) => {
  if (!ctx.userId) throw new ApiError('UNAUTHORIZED', '未授权', 401)
  const userId = ctx.userId

  const { searchParams } = new URL(request.url)
  const since = parseUpdatedSince(searchParams.get('updatedSince'))

  // 先取时刻再查询：查询期间写入的行会落在下一轮增量里（不会漏）
  const serverTime = new Date()

  const spaceIds = await myActiveSpaceIds(userId, ctx.username)

  const travelWhere: any = { updatedAt: { gt: since }, ...(spaceScopedWhere(userId, 'ownerId', spaceIds, ['SPACE', 'PUBLIC']) as object) }
  const momentWhere: any = { updatedAt: { gt: since }, ...(scopedWhere(userId) as object) }
  const albumWhere: any = { updatedAt: { gt: since }, ...(spaceScopedWhere(userId, 'userId', spaceIds, ['SPACE', 'PUBLIC']) as object) }
  /** Memory 没有 isPublic/userId 列：createdById ∪ PUBLIC ∪ 所在空间的 SPACE */
  const memoryWhere: any = {
    updatedAt: { gt: since },
    OR: [
      { createdById: userId },
      { visibility: 'PUBLIC' },
      { visibility: 'SPACE', spaceId: { in: spaceIds } },
    ],
  }

  const [travels, moments, albums, memories, tombstones] = await Promise.all([
    prisma.travel.findMany({
      where: travelWhere,
      orderBy: { updatedAt: 'asc' },
      take: LIMIT,
      select: {
        id: true, title: true, slug: true, description: true, location: true, cover: true,
        startDate: true, endDate: true, status: true, visibility: true, isPublic: true,
        spaceId: true, ownerId: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.moment.findMany({
      where: momentWhere,
      orderBy: { updatedAt: 'asc' },
      take: LIMIT,
      select: { id: true, content: true, tags: true, userId: true, isPublic: true, createdAt: true, updatedAt: true },
    }),
    prisma.album.findMany({
      where: albumWhere,
      orderBy: { updatedAt: 'asc' },
      take: LIMIT,
      select: {
        id: true, title: true, description: true, coverMediaId: true, date: true, locationId: true,
        travelId: true, visibility: true, isPublic: true, spaceId: true, userId: true,
        createdAt: true, updatedAt: true,
      },
    }),
    prisma.memory.findMany({
      where: memoryWhere,
      orderBy: { updatedAt: 'asc' },
      take: LIMIT,
      select: {
        id: true, title: true, content: true, happenedAt: true, mood: true, visibility: true,
        travelId: true, travelDayId: true, spaceId: true, createdById: true,
        createdAt: true, updatedAt: true,
      },
    }),
    prisma.syncTombstone.findMany({
      where: { userId, deletedAt: { gt: since }, entityType: { in: [...TOMBSTONE_TYPES] } },
      orderBy: { deletedAt: 'asc' },
      take: LIMIT,
      select: { entityType: true, entityId: true, deletedAt: true },
    }),
  ])

  const res = NextResponse.json({
    serverTime: serverTime.toISOString(),
    travels,
    moments: moments.map((m) => ({ ...m, tags: parseTags(m.tags) })),
    albums,
    memories,
    tombstones,
  })
  // 登录态数据：绝不进共享缓存
  res.headers.set('Cache-Control', 'private, no-store')
  return res
})
