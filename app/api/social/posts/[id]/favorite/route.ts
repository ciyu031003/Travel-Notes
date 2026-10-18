import { NextResponse } from 'next/server'
import { ApiError } from '@/lib/api-response'
import { withAuth } from '@/lib/api/handler'
import { setPostFavorite } from '@/lib/modules/social/social.service'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'

export const dynamic = 'force-dynamic'

/**
 * 收藏（幂等）：POST = 确保已收藏，DELETE = 确保未收藏。
 *
 * 为什么不能两边都调 toggle：离线队列会重放（网络失败入队、恢复回放、失败退避重试），
 * 切换语义下一次重放就把用户的收藏撤销了。幂等语义可安全重放。
 *
 * P1-17：路径 id 走 zod 校验；POST/DELETE 无 JSON body（reviewed-no-body-input）。
 */
export const POST = withAuth(async (_request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  if (!ctx.userId) throw new ApiError('UNAUTHORIZED', '未授权', 401)
  const { id } = await params
  // reviewed-no-body-input：收藏只有路径参数，没有 JSON body
  const postId = parseIdParam(id, '帖子 ID')
  try {
    return NextResponse.json({ success: true, data: await setPostFavorite(postId, ctx.userId, true) })
  } catch (error) {
    throw toApiError(error, '操作失败')
  }
})

export const DELETE = withAuth(async (_request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  if (!ctx.userId) throw new ApiError('UNAUTHORIZED', '未授权', 401)
  const { id } = await params
  // reviewed-no-body-input：取消收藏只有路径参数，没有 JSON body
  const postId = parseIdParam(id, '帖子 ID')
  try {
    return NextResponse.json({ success: true, data: await setPostFavorite(postId, ctx.userId, false) })
  } catch (error) {
    throw toApiError(error, '操作失败')
  }
})
