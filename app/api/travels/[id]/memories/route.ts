import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { prisma } from '@/lib/db'
import { memoryService } from '@/lib/modules/memory/memory.service'
import { ensureTravelDays } from '@/lib/modules/travel/travel.service'
import { canActOnContent } from '@/lib/modules/access'
import { spaceService } from '@/lib/modules/space/space.service'

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const { id } = await params
  const travelId = parseInt(id, 10)
  if (isNaN(travelId)) {
    return NextResponse.json({ error: '无效的旅行 ID' }, { status: 400 })
  }

  const travel = await prisma.travel.findUnique({
    where: { id: travelId },
    select: { spaceId: true, ownerId: true, visibility: true, isPublic: true },
  })
  if (!travel) return NextResponse.json({ error: '旅行不存在' }, { status: 404 })

  // 写权限：OWNER 或空间成员（与 access 层 canActOnContent 一致）
  const canWrite = await canActOnContent('Travel', travel, auth.payload?.userId)
  if (!canWrite) {
    return NextResponse.json({ error: '无权在该旅行下记录' }, { status: 403 })
  }

  // 个人旅行（spaceId 为空）也要能记录：Memory.spaceId 是必填列，
  // 而注册流程不创建任何 Space —— 早先这里直接 400「该旅行尚未关联空间」，
  // 导致个人旅行根本无法添加回忆与照片。现在自动落到该用户的「个人空间」。
  let spaceId = travel.spaceId
  if (!spaceId) {
    try {
      spaceId = await spaceService.ensurePersonalSpace(auth.username, auth.payload?.userId)
    } catch (e) {
      console.error('[POST /api/travels/:id/memories] ensurePersonalSpace failed:', (e as Error)?.message || e)
      return NextResponse.json({ error: '无法创建个人空间，请稍后重试' }, { status: 500 })
    }
  }

  const body = await request.json()

  // travelDayId（可选）：时间线按「天」分组依赖它（`TravelDay.memories` 关系）。
  // 只给 happenedAt 是不够的——回忆会挂到旅行但落不到具体某一天，
  // 用户点「记一笔」后当天仍显示"还没有记录"。
  //
  // 传了 dayId 才校验归属；**没传**时由服务端兜底补出第一天：
  // 存量旅行可能 0 天（没填日期就建了），此时前台点「记一笔」不该失败，
  // 更不该写成"挂在旅行、按天看不到"的孤儿回忆。
  let travelDayId: number | null = null
  if (body?.travelDayId != null) {
    const raw = parseInt(body.travelDayId, 10)
    if (Number.isFinite(raw)) {
      const day = await prisma.travelDay.findFirst({
        where: { id: raw, travelId },
        select: { id: true },
      })
      if (!day) return NextResponse.json({ error: '这一天不属于该旅行' }, { status: 400 })
      travelDayId = day.id
    }
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

  const memory = await memoryService.createMemory(auth.username, {
    spaceId,
    travelId,
    travelDayId,
    title: body?.title,
    content: body?.content ?? null,
    mood: body?.mood ?? null,
    happenedAt: body?.happenedAt ?? new Date().toISOString(),
  })

  return NextResponse.json({ success: true, memoryId: memory.id }, { status: 201 })
}
