import { NextResponse } from 'next/server'
import { ApiError } from '@/lib/api-response'
import { withAuth } from '@/lib/api/handler'
import { followUser, unfollowUser } from '@/lib/modules/social/social.service'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'

export const dynamic = 'force-dynamic'

/** P1-17：路径 id 走 zod 校验；POST/DELETE 均无 JSON body（reviewed-no-body-input）。 */
export const POST = withAuth(async (_request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  if (!ctx.userId) throw new ApiError('UNAUTHORIZED', '未授权', 401)
  const { id } = await params
  // reviewed-no-body-input：关注只有路径参数，没有 JSON body
  const targetId = parseIdParam(id, '用户 ID')
  try {
    return NextResponse.json({ success: true, data: await followUser(ctx.userId, targetId) })
  } catch (error) {
    throw toApiError(error, '关注失败')
  }
})

export const DELETE = withAuth(async (_request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  if (!ctx.userId) throw new ApiError('UNAUTHORIZED', '未授权', 401)
  const { id } = await params
  // reviewed-no-body-input：取关只有路径参数，没有 JSON body
  const targetId = parseIdParam(id, '用户 ID')
  try {
    return NextResponse.json({ success: true, data: await unfollowUser(ctx.userId, targetId) })
  } catch (error) {
    throw toApiError(error, '取关失败')
  }
})
