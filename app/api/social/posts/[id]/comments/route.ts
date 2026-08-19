import { NextRequest } from 'next/server'
import { getCurrentUserId } from '@/lib/current-user'
import { requireUserId } from '@/lib/modules/social/social-route-utils'
import { listPostComments, createPostComment } from '@/lib/modules/social/social.service'
import { ok, fail, unauthorized, serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(request)
  if (!userId) return unauthorized()
  const { id } = await params
  const postId = parseInt(id, 10)
  if (isNaN(postId)) return fail('无效 ID', 400)
  try {
    const body = await request.json()
    const comment = await createPostComment({ postId, userId, content: body?.content, parentId: body?.parentId ?? null })
    return ok(comment)
  } catch (e: any) { return fail(e.message || '评论失败', 400) }
}
