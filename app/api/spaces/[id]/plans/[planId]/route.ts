import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/handler'
import { parseIdParam, parseOptionalBody } from '@/lib/api/schemas/common'
import { UpdateSpacePlanSchema } from '@/lib/api/schemas/space-plan'
import { spacePlanService } from '@/lib/modules/space/space-plan.service'
import { planApiError } from '../_errors'

/**
 * GET    /api/spaces/[id]/plans/[planId] —— 计划详情（基本信息 + 共享清单 + 已转换状态）
 * PATCH  /api/spaces/[id]/plans/[planId] —— 改信息 / 整表替换清单 / 单条勾选（toggleTask）
 * DELETE /api/spaces/[id]/plans/[planId] —— 删除（空间 OWNER 或计划发起人）
 */
type Ctx = { params: Promise<{ id: string; planId: string }> }

export const GET = withAuth(async (_request, ctx, routeContext) => {
  const { id, planId: rawPlanId } = await (routeContext as Ctx).params
  const spaceId = parseIdParam(id, '空间 ID')
  const planId = parseIdParam(rawPlanId, '计划 ID')
  try {
    const plan = await spacePlanService.getPlan(ctx.username || '', spaceId, planId)
    return NextResponse.json({ plan })
  } catch (error) {
    planApiError(error, '获取旅行计划失败')
  }
})

export const PATCH = withAuth(async (request, ctx, routeContext) => {
  const { id, planId: rawPlanId } = await (routeContext as Ctx).params
  const spaceId = parseIdParam(id, '空间 ID')
  const planId = parseIdParam(rawPlanId, '计划 ID')
  // PATCH 允许空 body（例如仅靠 toggleTask 之外、前端只想刷新）：无 body 视为「没有需要更新的内容」
  const body = await parseOptionalBody(request, UpdateSpacePlanSchema)
  try {
    const plan = await spacePlanService.updatePlan(
      { username: ctx.username || '', userId: ctx.userId ?? null },
      spaceId,
      planId,
      body ?? {},
    )
    return NextResponse.json({ success: true, plan })
  } catch (error) {
    planApiError(error, '保存旅行计划失败')
  }
})

export const DELETE = withAuth(async (_request, ctx, routeContext) => {
  const { id, planId: rawPlanId } = await (routeContext as Ctx).params
  const spaceId = parseIdParam(id, '空间 ID')
  const planId = parseIdParam(rawPlanId, '计划 ID')
  try {
    await spacePlanService.deletePlan(
      { username: ctx.username || '', userId: ctx.userId ?? null },
      spaceId,
      planId,
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    planApiError(error, '删除旅行计划失败')
  }
})
