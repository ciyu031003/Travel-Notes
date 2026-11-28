import { NextResponse } from 'next/server'
import { withAuth, parseBody } from '@/lib/api/handler'
import { parseIdParam } from '@/lib/api/schemas/common'
import { UpdatePlanItemSchema } from '@/lib/api/schemas/space-plan-item'
import { spacePlanCollabService } from '@/lib/modules/space/space-plan-collab.service'
import { planWriteError } from '../../../_errors'

/**
 * PATCH  /api/spaces/[id]/plans/[planId]/items/[itemId] —— 改一块；**必须带 version**
 * DELETE /api/spaces/[id]/plans/[planId]/items/[itemId] —— 删一块；必须带 version（?version= 或 body.version）
 *
 * 冲突（version 不匹配）→ 409 + { code: 'VERSION_CONFLICT', current: 当前行 }，前端可选择采用对方/保留自己。
 */
type Ctx = { params: Promise<{ id: string; planId: string; itemId: string }> }

export const PATCH = withAuth(async (request, ctx, routeContext) => {
  const { id, planId: rawPlanId, itemId: rawItemId } = await (routeContext as Ctx).params
  const spaceId = parseIdParam(id, '空间 ID')
  const planId = parseIdParam(rawPlanId, '计划 ID')
  const itemId = parseIdParam(rawItemId, '块 ID')
  const body = await parseBody(request, UpdatePlanItemSchema)
  try {
    const result = await spacePlanCollabService.updateItem(
      { username: ctx.username || '', userId: ctx.userId ?? null },
      spaceId,
      planId,
      itemId,
      body,
    )
    return NextResponse.json({ success: true, item: result.item, eventId: result.eventId })
  } catch (error) {
    return planWriteError(error, '保存行程块失败')
  }
})

export const DELETE = withAuth(async (request, ctx, routeContext) => {
  const { id, planId: rawPlanId, itemId: rawItemId } = await (routeContext as Ctx).params
  const spaceId = parseIdParam(id, '空间 ID')
  const planId = parseIdParam(rawPlanId, '计划 ID')
  const itemId = parseIdParam(rawItemId, '块 ID')
  // version 允许放 query（DELETE 带 body 的兼容性差）或 JSON body
  let version: unknown = new URL(request.url).searchParams.get('version')
  if (version == null || version === '') {
    const text = await request.text().catch(() => '')
    if (text.trim()) {
      try {
        version = (JSON.parse(text) as { version?: unknown }).version
      } catch {
        version = undefined
      }
    }
  }
  try {
    const result = await spacePlanCollabService.deleteItem(
      { username: ctx.username || '', userId: ctx.userId ?? null },
      spaceId,
      planId,
      itemId,
      version,
    )
    return NextResponse.json({ success: true, eventId: result.eventId })
  } catch (error) {
    return planWriteError(error, '删除行程块失败')
  }
})
