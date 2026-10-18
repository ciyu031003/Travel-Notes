import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/handler'
import { spaceService } from '@/lib/modules/space/space.service'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'

/**
 * 成员退出空间（D1）：MEMBER/VIEWER 可退出，OWNER 不可（需删除空间）。
 * POST /api/spaces/[id]/leave
 *
 * P1-17：路径 id 走 zod 校验；无请求体（reviewed-no-body-input）。
 */
export const POST = withAuth(async (_request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  // reviewed-no-body-input：退出空间只有路径参数，没有 JSON body
  const spaceId = parseIdParam(id, '空间 ID')
  try {
    await spaceService.leaveSpace(ctx.username || '', spaceId)
    return NextResponse.json({ success: true })
  } catch (error) {
    throw toApiError(error, '退出失败', 403)
  }
})
