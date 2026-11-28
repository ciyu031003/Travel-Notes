import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/handler'
import { parseIdParam, parseOptionalBody } from '@/lib/api/schemas/common'
import { TogglePlanItemSchema } from '@/lib/api/schemas/space-plan-item'
import { spacePlanCollabService } from '@/lib/modules/space/space-plan-collab.service'
import { planWriteError } from '../../../../_errors'

/**
 * POST /api/spaces/[id]/plans/[planId]/items/[itemId]/toggle —— 原子勾选（done）
 *
 * body 可省略（按当前值取反）或 { done: true|false }；**不需要 version**：
 * 只 CAS done 字段，不覆盖别人对标题/时间/地点的改动，并发勾选也不会丢状态。
 */
type Ctx = { params: Promise<{ id: string; planId: string; itemId: string }> }

export const POST = withAuth(async (request, ctx, routeContext) => {
  const { id, planId: rawPlanId, itemId: rawItemId } = await (routeContext as Ctx).params
  const spaceId = parseIdParam(id, '空间 ID')
  const planId = parseIdParam(rawPlanId, '计划 ID')
  const itemId = parseIdParam(rawItemId, '块 ID')
  const body = await parseOptionalBody(request, TogglePlanItemSchema)
  try {
    const result = await spacePlanCollabService.toggleItem(
      { username: ctx.username || '', userId: ctx.userId ?? null },
      spaceId,
      planId,
      itemId,
      body?.done,
    )
    return NextResponse.json({ success: true, item: result.item, eventId: result.eventId })
  } catch (error) {
    return planWriteError(error, '勾选行程块失败')
  }
})
