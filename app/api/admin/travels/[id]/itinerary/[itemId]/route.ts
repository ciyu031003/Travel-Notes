import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { deleteItineraryItem } from '@/lib/modules/travel/travel.service'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { itemId } = await params
  const id = parseInt(itemId, 10)
  if (isNaN(id)) return NextResponse.json({ error: '无效 ID' }, { status: 400 })
  try {
    await deleteItineraryItem(id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 400 })
  }
}
