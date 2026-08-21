import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { deleteItineraryItem, findTravelIdByItineraryItemId, canManageTravel } from '@/lib/modules/travel/travel.service'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied
  const { itemId } = await params
  const id = parseInt(itemId, 10)
  if (isNaN(id)) return NextResponse.json({ error: '无效 ID' }, { status: 400 })
  const travelId = await findTravelIdByItineraryItemId(id)
  if (!travelId || !(await canManageTravel(travelId, auth.payload?.userId))) {
    return NextResponse.json({ error: '旅行不存在或无权操作' }, { status: 404 })
  }
  try {
    await deleteItineraryItem(id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 400 })
  }
}
