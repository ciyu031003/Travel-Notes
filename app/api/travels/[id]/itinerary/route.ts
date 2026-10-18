import { NextResponse } from 'next/server'
import { ApiError } from '@/lib/api-response'
import { parseBody, withAuth } from '@/lib/api/handler'
import { addItineraryItem, findTravelIdByDayId } from '@/lib/modules/travel/travel.service'
import { canActOnContent } from '@/lib/modules/access'
import { prisma } from '@/lib/db'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'
import { AddItineraryItemSchema } from '@/lib/api/schemas/travel'

export const dynamic = 'force-dynamic'

/**
 * 前台「添加行程」：给某一天加一个景点 / 餐厅 / 住宿 / 交通 / 活动。
 *
 * 为什么新增前台接口而不是复用 `/api/admin/travels/:id/itinerary`：
 *  · 后者挂在 /admin 命名空间下，前台调用语义错误；
 *  · 它的 `:id` 实际不被使用（服务端按 dayId 反查旅行），却要求调用方传一个假 id。
 *
 * 权限与 `itinerary/[itemId]` 的 DELETE 一致：OWNER 或空间成员。
 *
 * P1-17：body 由 zod 校验（dayId 正整数、标题 1-120 字），归属校验仍在服务层/路由内。
 */
export const POST = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const travelId = parseIdParam(id, '旅行 ID')
  const body = await parseBody(request, AddItineraryItemSchema)
  const dayId = body.dayId
  const title = body.title

  try {
    // dayId 必须属于路径里的这本旅行，避免跨旅行写入
    const ownerTravelId = await findTravelIdByDayId(dayId)
    if (!ownerTravelId || ownerTravelId !== travelId) {
      throw new ApiError('NOT_FOUND', '这一天不属于该旅行', 404)
    }

    const travel = await prisma.travel.findUnique({
      where: { id: travelId },
      select: { visibility: true, isPublic: true, ownerId: true, spaceId: true },
    })
    if (!travel) throw new ApiError('NOT_FOUND', '旅行不存在', 404)
    if (!(await canActOnContent('Travel', travel, ctx.userId))) {
      throw new ApiError('FORBIDDEN', '无权编辑该旅行', 403)
    }

    const result = await addItineraryItem(dayId, {
      title,
      startTime: body.startTime || undefined,
      endTime: body.endTime || undefined,
      type: body.type || 'SPOT',
      notes: body.notes || undefined,
    })
    return NextResponse.json({ success: true, id: result.id }, { status: 201 })
  } catch (error) {
    throw toApiError(error, '添加失败')
  }
})
