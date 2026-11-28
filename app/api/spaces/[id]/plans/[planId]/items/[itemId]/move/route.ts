import { NextResponse } from 'next/server'
import { withAuth, parseBody } from '@/lib/api/handler'
import { parseIdParam } from '@/lib/api/schemas/common'
import { MovePlanItemSchema } from '@/lib/api/schemas/space-plan-item'
import { spacePlanCollabService } from '@/lib/modules/space/space-plan-collab.service'
import { planWriteError } from '../../../../_errors'

/**
 * POST /api/spaces/[id]/plans/[planId]/items/[itemId]/move —— 跨天/排序（body: { dayId, sortOrder? }）
 *
 * 语义：把块移到目标天，并把目标天（与原天）的 sortOrder 重新编号成 0..n-1；
 * 受影响的行 version 会 +1（拿到旧 version 的客户端据此知道顺序变了）。
 */
type Ctx = { params: Promise<{ id: string; planId: string; itemId: string }> }

export const POST = withAuth(async (request, ctx, routeContext) => {
  const { id, planId: rawPlanId, itemId: rawItemId } = await (routeContext as Ctx).params
  const spaceId = parseIdParam(id, '空间 ID')
  const planId = parseIdParam(rawPlanId, '计划 ID')
  const itemId = parseIdParam(rawItemId, '块 ID')
  const body = await parseBody(request, MovePlanItemSchema)
  try {
    const result = await spacePlanCollabService.moveItem(
      { username: ctx.username || '', userId: ctx.userId ?? null },
      spaceId,
      planId,
      itemId,
      body,
    )
    return NextResponse.json({ success: true, item: result.item, eventId: result.eventId })
  } catch (error) {
    return planWriteError(error, '移动行程块失败')
  }
})
