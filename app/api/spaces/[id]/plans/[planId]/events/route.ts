import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/handler'
import { parseIdParam } from '@/lib/api/schemas/common'
import { PlanEventsQuerySchema } from '@/lib/api/schemas/space-plan-item'
import { spacePlanCollabService } from '@/lib/modules/space/space-plan-collab.service'
import { planApiError } from '../../_errors'

/**
 * GET /api/spaces/[id]/plans/[planId]/events?since=<eventId>&limit=<n> —— 增量事件
 *
 * 与 SSE 复用同一查询（事件由写操作在同一事务里追加，id 单调递增即游标）：
 * 客户端断线重连时带 since = 本地最后收到的 eventId，先补播再拉快照，保证不丢改动。
 */
type Ctx = { params: Promise<{ id: string; planId: string }> }

export const GET = withAuth(async (request, ctx, routeContext) => {
  const { id, planId: rawPlanId } = await (routeContext as Ctx).params
  const spaceId = parseIdParam(id, '空间 ID')
  const planId = parseIdParam(rawPlanId, '计划 ID')
  const url = new URL(request.url)
  const parsed = PlanEventsQuerySchema.safeParse({
    since: url.searchParams.get('since') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'since/limit 参数不合法', code: 'VALIDATION_ERROR' }, { status: 400 })
  }
  try {
    const result = await spacePlanCollabService.listEvents(
      { username: ctx.username || '', userId: ctx.userId ?? null },
      spaceId,
      planId,
      parsed.data.since,
      parsed.data.limit,
    )
    return NextResponse.json({ success: true, events: result.events, lastEventId: result.lastEventId })
  } catch (error) {
    planApiError(error, '获取计划事件失败')
  }
})
