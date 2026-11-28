import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/api/handler'
import { ApiError } from '@/lib/api-response'
import { parseIdParam } from '@/lib/api/schemas/common'
import { spacePlanService } from '@/lib/modules/space/space-plan.service'
import { planApiError } from '../../_errors'

/**
 * POST /api/spaces/[id]/plans/[planId]/convert —— 把计划一键变成**内容完整**的旅行记录。
 *
 * P3 起不再只建空壳旅行：天 → TravelDay、块 → ItineraryItem、块级照片 → 按天 Memory，
 * 计划的时间/地点/花销/预算全部带过去（详见 spacePlanService.convertPlan）。
 *
 * body（可省略）：`{ publish?: boolean }`
 *   · publish=true → 转换后同事务把旅行 visibility 置 PUBLIC 并写 TravelPost，返回 published:true；
 *   · 未勾选 / 空 body → 保持 SPACE（只留在空间内），返回 published:false。
 *
 * 重复调用幂等：alreadyConverted=true，不会重复建天/块。
 */
type Ctx = { params: Promise<{ id: string; planId: string }> }

/** body 只有 publish；空 body 与老客户端（不带 body）都按 false 处理 */
const ConvertPlanSchema = z.object({ publish: z.boolean().optional() })

async function readConvertOptions(request: Request): Promise<{ publish: boolean }> {
  const text = await request.text().catch(() => '')
  if (!text.trim()) return { publish: false }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ApiError('INVALID_JSON', '请求体不是合法的 JSON', 400)
  }
  const parsed = ConvertPlanSchema.safeParse(raw ?? {})
  if (!parsed.success) {
    throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0]?.message || '请求参数不合法', 400)
  }
  return { publish: parsed.data.publish === true }
}

export const POST = withAuth(async (request, ctx, routeContext) => {
  const { id, planId: rawPlanId } = await (routeContext as Ctx).params
  const spaceId = parseIdParam(id, '空间 ID')
  const planId = parseIdParam(rawPlanId, '计划 ID')
  const options = await readConvertOptions(request)
  try {
    const result = await spacePlanService.convertPlan(
      { username: ctx.username || '', userId: ctx.userId ?? null },
      spaceId,
      planId,
      options,
    )
    return NextResponse.json({
      success: true,
      travelId: result.travelId,
      travelSlug: result.travelSlug,
      alreadyConverted: result.alreadyConverted,
      // P3 新增：这条旅行是否已经进入旅行圈（向后兼容，老客户端忽略即可）
      published: result.published,
      plan: result.plan,
    })
  } catch (error) {
    planApiError(error, '转换旅行记录失败')
  }
})
