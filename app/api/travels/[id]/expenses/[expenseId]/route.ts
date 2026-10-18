import { NextResponse } from 'next/server'
import { ApiError } from '@/lib/api-response'
import { deleteExpense, findTravelIdByExpenseId } from '@/lib/modules/travel/travel.service'
import { guardTravelWrite } from '@/lib/modules/travel/api-guard'
import { asApiErrorFromResponse, parseIdParam, toApiError, withRouteErrors } from '@/lib/api/schemas/common'

export const dynamic = 'force-dynamic'

/**
 * 删除一条花销。
 * `[id]` 只是 URL 语义（与 travel 对齐），真正的归属校验按 expenseId 反查旅行，
 * 避免"用 A 旅行的路径删掉 B 旅行的花销"。
 *
 * P1-17：两个路径 id 都用 zod 正整数校验；无请求体（reviewed-no-body-input）。
 */
export const DELETE = withRouteErrors(async (request, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string; expenseId: string }> }
  const { id, expenseId } = await params
  // reviewed-no-body-input：DELETE 仅路径参数，没有 JSON body
  const travelId = parseIdParam(id, '旅行 ID')

  const guard = await guardTravelWrite(request, travelId)
  if (!guard.ok) throw await asApiErrorFromResponse(guard.response)

  const eid = parseIdParam(expenseId, '花销 ID')
  const ownerTravelId = await findTravelIdByExpenseId(eid)
  if (!ownerTravelId || ownerTravelId !== travelId) {
    throw new ApiError('NOT_FOUND', '这条花销不属于该旅行', 404)
  }
  try {
    await deleteExpense(eid)
    return NextResponse.json({ success: true })
  } catch (error) {
    throw toApiError(error, '删除失败')
  }
})
