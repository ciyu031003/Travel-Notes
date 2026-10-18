import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getCurrentUserId } from '@/lib/current-user'
import { listPostComments, createPostComment } from '@/lib/modules/social/social.service'
import { ok, fail, unauthorized, serverError, ApiError } from '@/lib/api-response'
import { withAuth, parseBody } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

/** 发评论请求体（P1-17）：内容必填，父评论可选 */
const CreateCommentSchema = z.object({
  content: z.string().trim().min(1, '评论内容不能为空').max(2_000, '评论过长'),
  parentId: z.number().int().positive().nullable().optional(),
})

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const postId = parseInt(id, 10)
  if (isNaN(postId)) return fail('无效 ID', 400)
  try {
    const userId = await getCurrentUserId()
    return ok(await listPostComments(postId, userId))
  } catch (e: any) {
    console.error('[GET /api/social/posts/[id]/comments]', e?.message || e)
    return serverError()
  }
}

export const POST = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  if (!ctx.userId) return unauthorized()
  const { id } = await params
  const postId = parseInt(id, 10)
  if (isNaN(postId)) throw new ApiError('INVALID_ID', '无效 ID', 400)

  const body = await parseBody(request, CreateCommentSchema)
  try {
    const comment = await createPostComment({
      postId,
      userId: ctx.userId,
      content: body.content,
      parentId: body.parentId ?? null,
    })
    return ok(comment)
  } catch (e: any) {
    throw new ApiError('COMMENT_FAILED', e?.message || '评论失败', 400)
  }
})
