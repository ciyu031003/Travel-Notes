import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { prisma } from '@/lib/db'
import { memoryService } from '@/lib/modules/memory/memory.service'

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

  const travel = await prisma.travel.findUnique({ where: { id: travelId }, select: { spaceId: true } })
  if (!travel) return NextResponse.json({ error: '旅行不存在' }, { status: 404 })
  if (!travel.spaceId) {
    return NextResponse.json({ error: '该旅行尚未关联空间，请先在后台为其关联空间' }, { status: 400 })
  }

  const body = await request.json()
  const memory = await memoryService.createMemory(auth.username, {
    spaceId: travel.spaceId,
    travelId,
    title: body?.title,
    content: body?.content ?? null,
    mood: body?.mood ?? null,
    happenedAt: body?.happenedAt ?? new Date().toISOString(),
  })

  return NextResponse.json({ success: true, memoryId: memory.id }, { status: 201 })
}
