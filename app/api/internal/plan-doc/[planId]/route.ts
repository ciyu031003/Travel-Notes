import { NextResponse } from 'next/server'
import { parseBody } from '@/lib/api/handler'
import { parseIdParam } from '@/lib/api/schemas/common'
import { PlanDocSyncSchema } from '@/lib/api/schemas/space-plan-doc'
import { isCollabSecretValid } from '@/lib/modules/space/plan-collab-token'
import { spacePlanCollabService } from '@/lib/modules/space/space-plan-collab.service'
import { SpacePlanNotFoundError } from '@/lib/modules/space/space-plan-errors'

/**
 * 内部 plan-doc 端点（仅实时服务调用，**不走 cookie 鉴权**）。
 *
 * 安全：只校验 x-collab-secret（常量时间比较，见 isCollabSecretValid）；
 * middleware 白名单里只放行了 '/api/internal/plan-doc' 这一个精确前缀。
 *
 * POST —— 提交 Yjs 快照 + 物化 rows + 追加事件（同一个事务）；
 *        幂等：与库里 state 字节完全相同 → 直接回既有 revision/eventId，不重复物化。
 * GET  —— 取初始快照（服务重启/新房间时灌进内存）；没有快照字节 → 404。
 */
type Ctx = { params: Promise<{ planId: string }> }

function unauthorized(): NextResponse {
  return NextResponse.json({ ok: false, error: '无效的协同密钥' }, { status: 401 })
}

function toIntParam(value: string): number | null {
  try {
    return parseIdParam(value, '计划 ID')
  } catch {
    return null
  }
}

export async function POST(request: Request, routeContext: Ctx): Promise<NextResponse> {
  if (!isCollabSecretValid(request.headers.get('x-collab-secret'))) return unauthorized()
  const { planId: rawPlanId } = await routeContext.params
  const planId = toIntParam(rawPlanId)
  if (planId == null) return NextResponse.json({ ok: false, error: '无效的计划 ID' }, { status: 400 })
  try {
    const body = await parseBody(request, PlanDocSyncSchema)
    if (body.planId != null && body.planId !== planId) {
      return NextResponse.json({ ok: false, error: 'planId 与路径不一致' }, { status: 400 })
    }
    const result = await spacePlanCollabService.syncPlanDoc({
      planId,
      yjsState: body.yjsState,
      materialized: {
        days: body.materialized.days,
        items: body.materialized.items,
        meta: (body.materialized.meta ?? null) as never,
      },
      presence: body.presence,
      source: body.source,
      clientId: body.clientId,
      sentAt: body.sentAt,
      actor: 'collab',
    })
    return NextResponse.json({
      ok: true,
      revision: result.revision,
      eventId: result.eventId,
      lastEventId: result.lastEventId,
      idempotent: result.idempotent,
      idMap: result.idMap,
    })
  } catch (error) {
    if (error instanceof SpacePlanNotFoundError) {
      return NextResponse.json({ ok: false, error: '旅行计划不存在' }, { status: 404 })
    }
    const message = (error as Error)?.message || '同步处理失败'
    const status = /prisma|sql|invalid `/i.test(message) ? 500 : 400
    if (status === 500) console.error('[api/internal/plan-doc] 同步失败:', error)
    return NextResponse.json({ ok: false, error: status === 500 ? '同步处理失败' : message }, { status })
  }
}

export async function GET(request: Request, routeContext: Ctx): Promise<NextResponse> {
  if (!isCollabSecretValid(request.headers.get('x-collab-secret'))) return unauthorized()
  const { planId: rawPlanId } = await routeContext.params
  const planId = toIntParam(rawPlanId)
  if (planId == null) return NextResponse.json({ ok: false, error: '无效的计划 ID' }, { status: 400 })
  try {
    const doc = await spacePlanCollabService.getPlanDoc(planId)
    if (!doc) return NextResponse.json({ ok: false, error: '暂无文档快照' }, { status: 404 })
    return NextResponse.json({ ok: true, ...doc })
  } catch (error) {
    if (error instanceof SpacePlanNotFoundError) {
      return NextResponse.json({ ok: false, error: '旅行计划不存在' }, { status: 404 })
    }
    console.error('[api/internal/plan-doc] 读取快照失败:', error)
    return NextResponse.json({ ok: false, error: '读取快照失败' }, { status: 500 })
  }
}
