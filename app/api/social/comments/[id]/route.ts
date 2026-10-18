import { NextResponse } from 'next/server'
import { ApiError } from '@/lib/api-response'
import { withAuth } from '@/lib/api/handler'
import { deletePostComment } from '@/lib/modules/social/social.service'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'

export const dynamic = 'force-dynamic'

/**
 * 删除评论（本人）。
 * P1-17：路径 id 走 zod 校验；DELETE 无请求体（reviewed-no-body-input）。
 */
export const DELETE = withAuth(async (_request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  if (!ctx.userId) throw new ApiError('UNAUTHORIZED', '未授权', 401)
  const { id } = await params
  // reviewed-no-body-input：DELETE 仅路径参数，没有 JSON body
  const commentId = parseIdParam(id, '评论 ID')
  try {
    return NextResponse.json({ success: true, data: await deletePostComment(commentId, ctx.userId) })
  } catch (error) {
    throw toApiError(error, '删除失败')
  }
})
