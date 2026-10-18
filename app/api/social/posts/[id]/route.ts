import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getCurrentUserId } from '@/lib/current-user'
import { getSocialPost, updateSocialPost } from '@/lib/modules/social/social.service'
import { ok, notFound, fail, unauthorized, serverError, ApiError } from '@/lib/api-response'
import { withAuth, parseBody } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

/** 编辑帖子请求体（P1-17）：标题/摘要都必填至少一项 */
const UpdatePostSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200, '标题过长').optional(),
  summary: z.string().max(5_000, '摘要过长').nullable().optional(),
})

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const postId = parseInt(id, 10)
    if (isNaN(postId)) return fail('无效 ID', 400)
    const userId = await getCurrentUserId()
    const post = await getSocialPost(postId, userId)
    if (!post) return notFound('帖子不存在')
    return ok(post)
  } catch (error: any) {
    console.error('[GET /api/social/posts/[id]]', error?.message || error)
    return serverError()
  }
}

export const PATCH = withAuth(async (request, ctx, routeContext) => {
  const { params } = routeContext as { params: Promise<{ id: string }> }
  const { id } = await params
  const postId = parseInt(id, 10)
  if (isNaN(postId)) throw new ApiError('INVALID_ID', '无效 ID', 400)
  if (!ctx.userId) return unauthorized()

  const body = await parseBody(request, UpdatePostSchema)
  const post = await updateSocialPost(postId, ctx.userId, {
    title: body.title,
    summary: body.summary ?? undefined,
  })
  if (!post) return notFound('帖子不存在或无权编辑')
  return ok(post)
})
