import { NextResponse } from 'next/server'
import { parseBody, withAuth } from '@/lib/api/handler'
import { setTravelSpace } from '@/lib/modules/travel/travel.service'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'
import { UpdateTravelSpaceSchema } from '@/lib/api/schemas/travel'

/**
 * 变更旅行归属：`{ spaceId: number | null }`
 *  · `null` → 收回成「仅自己」
 *  · 数字 → 移入该空间（我必须是该空间的 OWNER/MEMBER）
 *
 * 只有旅行的创建者能改归属（在 service 层判，前端藏按钮不算数）。
 *
 * P1-17：路径 id 与 body.spaceId 都由 zod 校验（空串/null 仍表示「收回成仅自己」）。
 */
export const PATCH = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const travelId = parseIdParam(id, '旅行 ID')
  const body = await parseBody(request, UpdateTravelSpaceSchema)

  try {
    const result = await setTravelSpace(travelId, body.spaceId, ctx.userId, ctx.username)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    throw toApiError(error, '操作失败', msg.includes('不存在') ? 404 : 403)
  }
})
