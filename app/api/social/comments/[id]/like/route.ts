import { NextResponse } from 'next/server'
import { ApiError } from '@/lib/api-response'
import { withAuth } from '@/lib/api/handler'
import { setCommentLike } from '@/lib/modules/social/social.service'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'

export const dynamic = 'force-dynamic'

/**
 * 评论点赞（幂等）：POST = 确保已赞，DELETE = 确保未赞。
 *
 * 为什么两个分支都写 `toggleCommentLike` 是错的（2026-10-17 修）：那样 POST 与 DELETE
 * 行为完全相同，客户端无法「重试」—— 乐观更新失败后重发一次，用户的赞反而被撤销。
 * 现在按目标状态落库（upsert / deleteMany），与帖子收藏的语义保持一致。
 *
 * P1-17：路径 id 走 zod 校验；POST/DELETE 都没有 JSON body（reviewed-no-body-input）。
 */
export const POST = withAuth(async (_request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  if (!ctx.userId) throw new ApiError('UNAUTHORIZED', '未授权', 401)
  const { id } = await params
  // reviewed-no-body-input：点赞只有路径参数，没有 JSON body
  const commentId = parseIdParam(id, '评论 ID')
  try {
    return NextResponse.json({ success: true, data: await setCommentLike(commentId, ctx.userId, true) })
  } catch (error) {
    throw toApiError(error, '操作失败')
  }
})

export const DELETE = withAuth(async (_request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  if (!ctx.userId) throw new ApiError('UNAUTHORIZED', '未授权', 401)
  const { id } = await params
  // reviewed-no-body-input：取消点赞只有路径参数，没有 JSON body
  const commentId = parseIdParam(id, '评论 ID')
  try {
    return NextResponse.json({ success: true, data: await setCommentLike(commentId, ctx.userId, false) })
  } catch (error) {
    throw toApiError(error, '操作失败')
  }
})
