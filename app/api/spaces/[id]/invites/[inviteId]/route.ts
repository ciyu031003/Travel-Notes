import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/handler'
import { spaceService } from '@/lib/modules/space/space.service'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'

/** P1-17：两个路径 id 都用 zod 正整数校验；无请求体（reviewed-no-body-input）。 */
export const DELETE = withAuth(async (_request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string; inviteId: string }> }
  const { id, inviteId } = await params
  // reviewed-no-body-input：DELETE 仅路径参数，没有 JSON body
  const spaceId = parseIdParam(id, '空间 ID')
  const invId = parseIdParam(inviteId, '邀请 ID')
  try {
    await spaceService.revokeInvite(ctx.username || '', spaceId, invId)
    return NextResponse.json({ success: true })
  } catch (error) {
    throw toApiError(error, '撤销失败', 403)
  }
})
