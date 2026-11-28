import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/handler'
import { parseIdParam, parseOptionalBody } from '@/lib/api/schemas/common'
import { UpdateSpacePlanSchema } from '@/lib/api/schemas/space-plan'
import { spacePlanService } from '@/lib/modules/space/space-plan.service'
import { spacePlanCollabService } from '@/lib/modules/space/space-plan-collab.service'
import { planApiError, planWriteError } from '../_errors'

/**
 * GET    /api/spaces/[id]/plans/[planId] —— 计划详情
 * PATCH  /api/spaces/[id]/plans/[planId] —— 改信息 / 整表替换清单 / 单条勾选（toggleTask）/ 计划级 version 乐观锁
 * DELETE /api/spaces/[id]/plans/[planId] —— 删除（空间 OWNER 或计划发起人）
 *
 * P1a 起详情额外返回：days（含 items 嵌套）、items（扁平）、members、presence、docRevision、lastEventId。
 * 老计划没有天/块 → days: [] / items: []，不报错（兼容现有页面）。
 */
type Ctx = { params: Promise<{ id: string; planId: string }> }

export const GET = withAuth(async (_request, ctx, routeContext) => {
  const { id, planId: rawPlanId } = await (routeContext as Ctx).params
  const spaceId = parseIdParam(id, '空间 ID')
  const planId = parseIdParam(rawPlanId, '计划 ID')
  try {
    const detail = await spacePlanCollabService.getPlanDetail(
      { username: ctx.username || '', userId: ctx.userId ?? null },
      spaceId,
      planId,
    )
    return NextResponse.json({
      plan: detail.plan,
      days: detail.days,
      items: detail.items,
      members: detail.members,
      presence: detail.presence,
      docRevision: detail.docRevision,
      lastEventId: detail.lastEventId,
    })
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
    return planWriteError(error, '保存旅行计划失败')
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
