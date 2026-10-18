import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/current-user'
import { prisma } from '@/lib/db'
import { canViewResourceById } from '@/lib/modules/access'
import { addExpense, getTravelExpenses } from '@/lib/modules/travel/travel.service'
import { normalizeExpenseCategory } from '@/lib/modules/travel/expense-categories'
import { guardTravelWrite } from '@/lib/modules/travel/api-guard'
import { parseBody } from '@/lib/api/handler'
import { asApiErrorFromResponse, parseIdParam, toApiError, withRouteErrors } from '@/lib/api/schemas/common'
import { AddExpenseSchema } from '@/lib/api/schemas/travel'

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
 *
 * P1-17：POST body 由 zod 校验（金额/分类/绑定行程等），金额的业务上限仍是服务层兜底。
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

export const POST = withRouteErrors(async (request, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const travelId = parseIdParam(id, '旅行 ID')

  const guard = await guardTravelWrite(request, travelId)
  if (!guard.ok) throw await asApiErrorFromResponse(guard.response)

  const body = await parseBody(request, AddExpenseSchema)
  try {
    const result = await addExpense(travelId, {
      amount: body.amount,
      currency: body.currency || 'CNY',
      category: normalizeExpenseCategory(body.category),
      payer: body.payer ?? undefined,
      note: body.note ?? undefined,
      happenedAt: body.happenedAt ? body.happenedAt : undefined,
      /**
       * 可选绑定行程：只做形态校验；**归属校验在服务层**
       * （addExpense 会确认该行程确实属于本旅行，跨旅行/已删除则退化为不绑定）。
       */
      itineraryItemId: body.itineraryItemId ?? null,
    })
    return NextResponse.json({ success: true, id: result.id }, { status: 201 })
  } catch (error) {
    throw toApiError(error, '添加失败')
  }
})
