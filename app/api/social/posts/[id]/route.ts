import { NextRequest } from 'next/server'
import { getCurrentUserId } from '@/lib/current-user'
import { getSocialPost, updateSocialPost } from '@/lib/modules/social/social.service'
import { ok, notFound, unauthorized, serverError, fail } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const postId = parseInt(id, 10)
    if (isNaN(postId)) return fail('无效 ID', 400)

    const userId = await getCurrentUserId()
    if (!userId) return unauthorized()

    const body = await request.json().catch(() => ({}))
    const post = await updateSocialPost(postId, userId, {
      title: body?.title,
      summary: body?.summary,
    })
    if (!post) return notFound('帖子不存在或无权编辑')
    return ok(post)
  } catch (error: any) {
    console.error('[PATCH /api/social/posts/[id]]', error?.message || error)
    return fail(error?.message || '更新失败', 400)
  }
}
