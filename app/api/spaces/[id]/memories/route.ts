import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { memoryService } from '@/lib/modules/memory/memory.service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const spaceId = parseInt(id, 10)
  if (isNaN(spaceId)) {
    return NextResponse.json({ error: '无效的空间 ID' }, { status: 400 })
  }
  const travelIdParam = request.nextUrl.searchParams.get('travelId')
  const travelId = travelIdParam ? parseInt(travelIdParam, 10) : null
  try {
    const memories = await memoryService.listMemories(auth.username, spaceId, Number.isFinite(travelId) ? travelId : null)
    return NextResponse.json({ memories })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 403 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const spaceId = parseInt(id, 10)
  if (isNaN(spaceId)) {
    return NextResponse.json({ error: '无效的空间 ID' }, { status: 400 })
  }
  try {
    const body = await request.json()
    const result = await memoryService.createMemory(auth.username, {
      spaceId,
      title: body?.title,
      content: body?.content ?? null,
      travelId: body?.travelId ?? null,
      travelDayId: body?.travelDayId ?? null,
      happenedAt: body?.happenedAt ?? null,
      locationId: body?.locationId ?? null,
      mood: body?.mood ?? null,
      visibility: body?.visibility ?? undefined,
    })
    return NextResponse.json({ success: true, memoryId: result.id }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '创建失败' }, { status: 400 })
  }
}
