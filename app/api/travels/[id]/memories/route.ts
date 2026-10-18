import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ApiError } from '@/lib/api-response'
import { parseBody, withAuth } from '@/lib/api/handler'
import { memoryService } from '@/lib/modules/memory/memory.service'
import { ensureTravelDays } from '@/lib/modules/travel/travel.service'
import { canActOnContent } from '@/lib/modules/access'
import { spaceService } from '@/lib/modules/space/space.service'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'
import { CreateTravelMemorySchema } from '@/lib/api/schemas/travel'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const travelId = parseInt(id, 10)
  if (isNaN(travelId)) {
    return NextResponse.json({ error: '无效的旅行 ID' }, { status: 400 })
  }

  const travel = await prisma.travel.findUnique({ where: { id: travelId }, select: { spaceId: true } })
  if (!travel) return NextResponse.json({ memories: [] })

  if (!travel.spaceId) return NextResponse.json({ memories: [] })

  const memories = await prisma.memory.findMany({
    where: { travelId },
    orderBy: [{ happenedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true, title: true, content: true, mood: true, happenedAt: true, createdAt: true,
    },
  })
  return NextResponse.json({ memories })
}

/**
 * 在某本旅行下记一条回忆。
 *
 * P1-17：body 由 zod 校验（标题必填、内容/心情长度、travelDayId 正整数、isPublic 布尔）；
 * 权限与空间兜底逻辑保持不变（OWNER/空间成员；个人旅行自动落到个人空间）。
 */
export const POST = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const travelId = parseIdParam(id, '旅行 ID')
  const body = await parseBody(request, CreateTravelMemorySchema)

  const username = ctx.username || ''
  const travel = await prisma.travel.findUnique({
    where: { id: travelId },
    select: { spaceId: true, ownerId: true, visibility: true, isPublic: true },
  })
  if (!travel) throw new ApiError('NOT_FOUND', '旅行不存在', 404)

  // 写权限：OWNER 或空间成员（与 access 层 canActOnContent 一致）
  const canWrite = await canActOnContent('Travel', travel, ctx.userId)
  if (!canWrite) throw new ApiError('FORBIDDEN', '无权在该旅行下记录', 403)

  // 个人旅行（spaceId 为空）也要能记录：Memory.spaceId 是必填列，
  // 而注册流程不创建任何 Space —— 早先这里直接 400「该旅行尚未关联空间」，
  // 导致个人旅行根本无法添加回忆与照片。现在自动落到该用户的「个人空间」。
  let spaceId = travel.spaceId
  if (!spaceId) {
    try {
      spaceId = await spaceService.ensurePersonalSpace(username, ctx.userId)
    } catch (e) {
      console.error('[POST /api/travels/:id/memories] ensurePersonalSpace failed:', (e as Error)?.message || e)
      throw new ApiError('PERSONAL_SPACE_FAILED', '无法创建个人空间，请稍后重试', 500)
    }
  }

  // travelDayId（可选）：时间线按「天」分组依赖它（`TravelDay.memories` 关系）。
  // 只给 happenedAt 是不够的——回忆会挂到旅行但落不到具体某一天，
  // 用户点「记一笔」后当天仍显示"还没有记录"。
  //
  // 传了 dayId 才校验归属；**没传**时由服务端兜底补出第一天：
  // 存量旅行可能 0 天（没填日期就建了），此时前台点「记一笔」不该失败，
  // 更不该写成"挂在旅行、按天看不到"的孤儿回忆。
  let travelDayId: number | null = null
  if (body.travelDayId != null) {
    const day = await prisma.travelDay.findFirst({
      where: { id: body.travelDayId, travelId },
      select: { id: true },
    })
    if (!day) throw new ApiError('INVALID_DAY', '这一天不属于该旅行', 400)
    travelDayId = day.id
  }
  if (travelDayId == null) {
    const existing = await prisma.travelDay.findFirst({
      where: { travelId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    })
    if (existing) {
      travelDayId = existing.id
    } else {
      const t = await prisma.travel.findUnique({
        where: { id: travelId },
        select: { startDate: true, endDate: true },
      })
      await ensureTravelDays(travelId, t?.startDate?.toISOString() ?? null, t?.endDate?.toISOString() ?? null).catch(() => ({ created: 0 }))
      const first = await prisma.travelDay.findFirst({
        where: { travelId },
        orderBy: { sortOrder: 'asc' },
        select: { id: true },
      })
      travelDayId = first?.id ?? null
    }
  }

  try {
    const memory = await memoryService.createMemory(username, {
      spaceId,
      travelId,
      travelDayId,
      title: body.title,
      content: body.content ?? null,
      mood: body.mood ?? null,
      happenedAt: body.happenedAt ?? new Date().toISOString(),
      // 可见性（R2）：公开旅行里的单条回忆默认仍是 SPACE（仅自己与同行者）。
      // 旅行圈详情只下发 `visibility = PUBLIC` 的回忆，所以"想被别人看到"必须显式打开。
      visibility: body.isPublic === true ? 'PUBLIC' : 'SPACE',
    })

    return NextResponse.json({ success: true, memoryId: memory.id }, { status: 201 })
  } catch (error) {
    throw toApiError(error, '记录失败')
  }
})
