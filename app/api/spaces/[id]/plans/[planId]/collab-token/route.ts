import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/handler'
import { parseIdParam } from '@/lib/api/schemas/common'
import { spacePlanCollabService } from '@/lib/modules/space/space-plan-collab.service'
import { planApiError } from '../../_errors'

/**
 * POST /api/spaces/[id]/plans/[planId]/collab-token —— 签发实时协同 token
 *
 * 响应：success + token / wsUrl / room('plan-<planId>') / expiresIn(300) / exp。
 * token = v1.<base64url(planId|userId|exp)>.<base64url(HMAC_SHA256(COLLAB_SECRET, payload))>，5 分钟有效。
 * 权限：OWNER/MEMBER；VIEWER 只读（不给协同写权限）。
 */
type Ctx = { params: Promise<{ id: string; planId: string }> }

export const POST = withAuth(async (_request, ctx, routeContext) => {
  const { id, planId: rawPlanId } = await (routeContext as Ctx).params
  const spaceId = parseIdParam(id, '空间 ID')
  const planId = parseIdParam(rawPlanId, '计划 ID')
  try {
    const issued = await spacePlanCollabService.issueCollabToken(
      { username: ctx.username || '', userId: ctx.userId ?? null },
      spaceId,
      planId,
    )
    return NextResponse.json({ success: true, ...issued })
  } catch (error) {
    planApiError(error, '获取协同 token 失败')
  }
})
