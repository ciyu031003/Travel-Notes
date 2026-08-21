import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { addDay, canManageTravel } from '@/lib/modules/travel/travel.service'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  const { id } = await params
  const travelId = parseInt(id, 10)
  if (isNaN(travelId)) return NextResponse.json({ error: '无效 ID' }, { status: 400 })
  const owned = await canManageTravel(travelId, auth.payload?.userId)
  if (!owned) return NextResponse.json({ error: '旅行不存在或无权操作' }, { status: 404 })
  try {
    const body = await request.json()
    const result = await addDay(travelId, {
      date: body?.date || undefined,
      title: body?.title ? String(body.title) : undefined,
      summary: body?.summary ? String(body.summary) : undefined,
    })
    return NextResponse.json({ success: true, id: result.id }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '添加失败' }, { status: 400 })
  }
}
