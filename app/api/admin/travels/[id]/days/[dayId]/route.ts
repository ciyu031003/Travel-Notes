import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { updateDay, deleteDay } from '@/lib/modules/travel/travel.service'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; dayId: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  const { dayId } = await params
  const id = parseInt(dayId, 10)
  if (isNaN(id)) return NextResponse.json({ error: '无效 ID' }, { status: 400 })
  try {
    const body = await request.json()
    await updateDay(id, body)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '更新失败' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; dayId: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  const { dayId } = await params
  const id = parseInt(dayId, 10)
  if (isNaN(id)) return NextResponse.json({ error: '无效 ID' }, { status: 400 })
  try {
    await deleteDay(id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 400 })
  }
}
