import { NextResponse } from 'next/server'
import { withAuth, parseBody } from '@/lib/api/handler'
import { parseIdParam } from '@/lib/api/schemas/common'
import { CreateSpacePlanSchema } from '@/lib/api/schemas/space-plan'
import { spacePlanService } from '@/lib/modules/space/space-plan.service'
import { planApiError } from './_errors'

/**
 * GET  /api/spaces/[id]/plans —— 空间旅行计划列表（含清单完成数）
 * POST /api/spaces/[id]/plans —— 发起一个旅行计划
 *
 * P1a：POST 的 body 可带引擎输入（departureCity/transportMode/pace/interests/travelers）；
 * 给了起止日期时服务端用规划引擎生成「天 + 块」骨架，响应里额外回 days/items/lastEventId。
 *
 * 权限：列表 OWNER/MEMBER/VIEWER 均可读；创建仅 OWNER/MEMBER（VIEWER 只读）。
 * 服务端是唯一判权点，前端 canEdit 只影响显隐。
 */
export const GET = withAuth(async (_request, ctx, routeContext) => {
  const { id } = await (routeContext as { params: Promise<{ id: string }> }).params
  const spaceId = parseIdParam(id, '空间 ID')
  try {
    const plans = await spacePlanService.listPlans(ctx.username || '', spaceId)
    return NextResponse.json({ plans })
  } catch (error) {
    planApiError(error, '获取旅行计划失败')
  }
})

export const POST = withAuth(async (request, ctx, routeContext) => {
  const { id } = await (routeContext as { params: Promise<{ id: string }> }).params
  const spaceId = parseIdParam(id, '空间 ID')
  const body = await parseBody(request, CreateSpacePlanSchema)
  try {
    const result = await spacePlanService.createPlan(
      { username: ctx.username || '', userId: ctx.userId ?? null },
      spaceId,
      body,
    )
    return NextResponse.json({
      success: true,
      plan: result.plan,
      days: result.days,
      items: result.items,
      docRevision: result.docRevision,
      lastEventId: result.lastEventId,
    }, { status: 201 })
  } catch (error) {
    planApiError(error, '发起旅行计划失败')
  }
})
