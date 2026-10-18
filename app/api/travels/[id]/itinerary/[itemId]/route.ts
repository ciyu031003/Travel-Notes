import { NextResponse } from 'next/server'
import { ApiError } from '@/lib/api-response'
import { parseBody } from '@/lib/api/handler'
import {
  findTravelIdByItineraryItemId,
  updateItineraryItem,
  deleteItineraryItem,
} from '@/lib/modules/travel/travel.service'
import { guardTravelWrite } from '@/lib/modules/travel/api-guard'
import {
  asApiErrorFromResponse,
  parseIdParam,
  toApiError,
  withRouteErrors,
} from '@/lib/api/schemas/common'
import { UpdateItineraryItemSchema } from '@/lib/api/schemas/travel'

export const dynamic = 'force-dynamic'

/**
 * 修改 / 删除一个行程项。
 *
 * 为什么需要：前台此前**只有** `POST /api/travels/:id/itinerary`，行程加错了
 * 既删不掉也改不了 —— 用户只能眼睁睁看着错的条目留在时间线上。
 * 权限与新增一致；归属按 itemId 反查旅行，避免跨旅行改别人的行程。
 *
 * P1-17：路径 id 走 zod 校验；PATCH body 由 zod 校验（DELETE 无 body）。
 */
async function resolve(request: Parameters<typeof guardTravelWrite>[0], id: string, itemId: string) {
  const travelId = parseIdParam(id, '旅行 ID')
  const guard = await guardTravelWrite(request, travelId)
  if (!guard.ok) throw await asApiErrorFromResponse(guard.response)
  const iid = parseIdParam(itemId, '行程 ID')
  const ownerTravelId = await findTravelIdByItineraryItemId(iid)
  if (!ownerTravelId || ownerTravelId !== travelId) {
    throw new ApiError('NOT_FOUND', '这条行程不属于该旅行', 404)
  }
  return iid
}

export const PATCH = withRouteErrors(async (request, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string; itemId: string }> }
  const { id, itemId } = await params
  const resolvedItemId = await resolve(request, id, itemId)
  const body = await parseBody(request, UpdateItineraryItemSchema)
  try {
    await updateItineraryItem(resolvedItemId, {
      title: body.title,
      startTime: body.startTime === undefined ? undefined : body.startTime || null,
      endTime: body.endTime === undefined ? undefined : body.endTime || null,
      type: body.type,
      notes: body.notes === undefined ? undefined : body.notes || null,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    throw toApiError(error, '保存失败')
  }
})

export const DELETE = withRouteErrors(async (request, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string; itemId: string }> }
  const { id, itemId } = await params
  // reviewed-no-body-input：DELETE 仅路径参数，没有 JSON body
  const resolvedItemId = await resolve(request, id, itemId)
  try {
    await deleteItineraryItem(resolvedItemId)
    return NextResponse.json({ success: true })
  } catch (error) {
    throw toApiError(error, '删除失败')
  }
})
