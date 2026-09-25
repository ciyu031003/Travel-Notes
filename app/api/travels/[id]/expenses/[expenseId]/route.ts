import { NextRequest, NextResponse } from 'next/server'
import { deleteExpense, findTravelIdByExpenseId } from '@/lib/modules/travel/travel.service'
import { guardTravelWrite } from '@/lib/modules/travel/api-guard'

export const dynamic = 'force-dynamic'

/**
 * 删除一条花销。
 * `[id]` 只是 URL 语义（与 travel 对齐），真正的归属校验按 expenseId 反查旅行，
 * 避免"用 A 旅行的路径删掉 B 旅行的花销"。
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; expenseId: string }> }) {
  const { id, expenseId } = await params
  const travelId = parseInt(id, 10)
  const guard = await guardTravelWrite(request, travelId)
  if (!guard.ok) return guard.response

  const eid = parseInt(expenseId, 10)
  if (!Number.isFinite(eid)) {
    return NextResponse.json({ error: '无效的花销 ID' }, { status: 400 })
  }
  const ownerTravelId = await findTravelIdByExpenseId(eid)
  if (!ownerTravelId || ownerTravelId !== travelId) {
    return NextResponse.json({ error: '这条花销不属于该旅行' }, { status: 404 })
  }
  try {
    await deleteExpense(eid)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: (error as Error)?.message || '删除失败' }, { status: 400 })
  }
}
