import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { addItineraryItem } from '@/lib/modules/travel/travel.service'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  try {
    const body = await request.json()
    const dayId = parseInt(body?.dayId, 10)
    const title = String(body?.title || '').trim()
    if (isNaN(dayId) || !title) {
      return NextResponse.json({ error: '参数不完整：dayId/title 必填' }, { status: 400 })
    }
    const result = await addItineraryItem(dayId, {
      title,
      startTime: body?.startTime || undefined,
      endTime: body?.endTime || undefined,
      type: body?.type || 'SPOT',
      notes: body?.notes ? String(body.notes) : undefined,
    })
    return NextResponse.json({ success: true, id: result.id }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '添加失败' }, { status: 400 })
  }
}
