import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/current-user'
import { prisma } from '@/lib/db'
import { canViewResourceById } from '@/lib/modules/access'
import { addExpense, getTravelExpenses } from '@/lib/modules/travel/travel.service'
import { normalizeExpenseCategory } from '@/lib/modules/travel/expense-categories'
import { guardTravelWrite } from '@/lib/modules/travel/api-guard'

export const dynamic = 'force-dynamic'

/**
 * 前台旅行花销（记账）。
 *
 * 为什么需要新增前台接口：`Expense` 模型与 `addExpense` 早就有了，但入口只挂在
 * `/api/admin/travels/:id/expenses`，且要求 `canManageContent` 能力位 ——
 * 普通用户在 App 里记一笔花销会被 403。真机反馈的「花销预计是多少，没有入口」
 * 既缺 UI 也缺接口，这里是接口那一半。
 *
 * 权限口径与 `days` / `itinerary` / `memories` 完全一致（`guardTravelWrite`）。
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const travelId = parseInt(id, 10)
  const userId = await getCurrentUserId()
  if (!(await canViewResourceById('Travel', travelId, userId))) {
    return NextResponse.json({ error: '旅行不存在' }, { status: 404 })
  }
  try {
    const [{ expenses, total }, travel] = await Promise.all([
      getTravelExpenses(travelId),
      prisma.travel.findUnique({ where: { id: travelId }, select: { budget: true } }),
    ])
    const budget = travel?.budget == null ? null : Number(travel.budget)
    return NextResponse.json({ expenses, total, budget })
  } catch (error) {
    return NextResponse.json({ error: (error as Error)?.message || '获取失败' }, { status: 400 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const travelId = parseInt(id, 10)
  const guard = await guardTravelWrite(request, travelId)
  if (!guard.ok) return guard.response

  try {
    const body = await request.json()
    const amount = Number(body?.amount)
    // 金额必须是有限正数：NaN/0/负数会让合计与进度条直接失真
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: '请输入有效金额' }, { status: 400 })
    }
    if (amount > 100_000_000) {
      return NextResponse.json({ error: '金额数值过大' }, { status: 400 })
    }
    const result = await addExpense(travelId, {
      amount,
      currency: body?.currency ? String(body.currency).slice(0, 10) : 'CNY',
      category: normalizeExpenseCategory(body?.category),
      payer: body?.payer ? String(body.payer).slice(0, 60) : undefined,
      note: body?.note ? String(body.note).slice(0, 200) : undefined,
      happenedAt: body?.happenedAt ? String(body.happenedAt) : undefined,
    })
    return NextResponse.json({ success: true, id: result.id }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error)?.message || '添加失败' }, { status: 400 })
  }
}
