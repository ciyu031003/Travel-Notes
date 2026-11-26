import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/handler'
import { parseIdParam } from '@/lib/api/schemas/common'
import { spacePlanService } from '@/lib/modules/space/space-plan.service'
import { planApiError } from '../../_errors'

/**
 * POST /api/spaces/[id]/plans/[planId]/convert —— 把计划一键变成旅行记录（草稿）。
 *
 * 用计划信息创建一条 Travel（spaceId 关联该空间，status=PLANNED、visibility=SPACE），
 * 回填 convertedTravelId；重复调用幂等（alreadyConverted=true，不会重复建）。
 */
type Ctx = { params: Promise<{ id: string; planId: string }> }

export const POST = withAuth(async (_request, ctx, routeContext) => {
  const { id, planId: rawPlanId } = await (routeContext as Ctx).params
  const spaceId = parseIdParam(id, '空间 ID')
  const planId = parseIdParam(rawPlanId, '计划 ID')
  try {
    const result = await spacePlanService.convertPlan(
      { username: ctx.username || '', userId: ctx.userId ?? null },
      spaceId,
      planId,
    )
    return NextResponse.json({
      success: true,
      travelId: result.travelId,
      travelSlug: result.travelSlug,
      alreadyConverted: result.alreadyConverted,
      plan: result.plan,
    })
  } catch (error) {
    planApiError(error, '转换旅行记录失败')
  }
})
