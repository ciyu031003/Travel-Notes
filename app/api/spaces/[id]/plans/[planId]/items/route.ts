import { NextResponse } from 'next/server'
import { withAuth, parseBody } from '@/lib/api/handler'
import { parseIdParam } from '@/lib/api/schemas/common'
import { CreatePlanItemSchema } from '@/lib/api/schemas/space-plan-item'
import { spacePlanCollabService } from '@/lib/modules/space/space-plan-collab.service'
import { planWriteError } from '../../_errors'

/**
 * POST /api/spaces/[id]/plans/[planId]/items —— 新增一块（dayId/kind/title/startAt/place/costCents/note/mediaIds）
 *
 * 响应：{ success, item（含新 version）, eventId }；eventId 用来对 SSE 增量流做游标。
 * 权限：OWNER/MEMBER（VIEWER 只读）。
 */
type Ctx = { params: Promise<{ id: string; planId: string }> }

export const POST = withAuth(async (request, ctx, routeContext) => {
  const { id, planId: rawPlanId } = await (routeContext as Ctx).params
  const spaceId = parseIdParam(id, '空间 ID')
  const planId = parseIdParam(rawPlanId, '计划 ID')
  const body = await parseBody(request, CreatePlanItemSchema)
  try {
    const result = await spacePlanCollabService.createItem(
      { username: ctx.username || '', userId: ctx.userId ?? null },
      spaceId,
      planId,
      body,
    )
    return NextResponse.json({ success: true, item: result.item, eventId: result.eventId }, { status: 201 })
  } catch (error) {
    return planWriteError(error, '新增行程块失败')
  }
})
