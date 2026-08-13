import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { addExpense } from '@/lib/modules/travel/travel.service'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  const { id } = await params
  const travelId = parseInt(id, 10)
  if (isNaN(travelId)) return NextResponse.json({ error: '无效 ID' }, { status: 400 })
  try {
    const body = await request.json()
    const amount = parseFloat(body?.amount)
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: '请输入有效金额' }, { status: 400 })
    }
    const result = await addExpense(travelId, {
      amount,
      currency: body?.currency || 'CNY',
      category: body?.category || 'OTHER',
      payer: body?.payer ? String(body.payer) : undefined,
      note: body?.note ? String(body.note) : undefined,
      happenedAt: body?.happenedAt || undefined,
    })
    return NextResponse.json({ success: true, id: result.id }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '添加失败' }, { status: 400 })
  }
}
