import { NextResponse } from 'next/server'
import { ApiError } from '@/lib/api-response'
import { parseBody, withAuth } from '@/lib/api/handler'
import { reportPost } from '@/lib/modules/social/social.service'
import { parseIdParam, toApiError } from '@/lib/api/schemas/common'
import { ReportPostSchema } from '@/lib/api/schemas/social'

export const dynamic = 'force-dynamic'

/** P1-17：路径 id 与 body.reason 都由 zod 校验（原因必填、最长 255）。 */
export const POST = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  if (!ctx.userId) throw new ApiError('UNAUTHORIZED', '未授权', 401)
  const { id } = await params
  const postId = parseIdParam(id, '帖子 ID')
  const body = await parseBody(request, ReportPostSchema)
  try {
    return NextResponse.json({ success: true, data: await reportPost(postId, ctx.userId, body.reason) })
  } catch (error) {
    throw toApiError(error, '举报失败')
  }
})
