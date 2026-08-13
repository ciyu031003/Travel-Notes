import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { memoryService } from '@/lib/modules/memory/memory.service'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(_request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const memoryId = parseInt(id, 10)
  if (isNaN(memoryId)) {
    return NextResponse.json({ error: '无效的回忆 ID' }, { status: 400 })
  }
  try {
    const memory = await memoryService.getMemory(auth.username, memoryId)
    return NextResponse.json({ memory })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 403 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const memoryId = parseInt(id, 10)
  if (isNaN(memoryId)) {
    return NextResponse.json({ error: '无效的回忆 ID' }, { status: 400 })
  }
  try {
    const body = await request.json()
    const memory = await memoryService.updateMemory(auth.username, memoryId, {
      title: body?.title,
      content: body?.content,
      happenedAt: body?.happenedAt,
      travelId: body?.travelId,
      travelDayId: body?.travelDayId,
      locationId: body?.locationId,
      mood: body?.mood,
      visibility: body?.visibility,
    })
    return NextResponse.json({ success: true, memory })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '更新失败' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated || !auth.username) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const memoryId = parseInt(id, 10)
  if (isNaN(memoryId)) {
    return NextResponse.json({ error: '无效的回忆 ID' }, { status: 400 })
  }
  try {
    await memoryService.deleteMemory(auth.username, memoryId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 400 })
  }
}
