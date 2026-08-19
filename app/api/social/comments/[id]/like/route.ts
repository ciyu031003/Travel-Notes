import { NextRequest } from 'next/server'
import { requireUserId } from '@/lib/modules/social/social-route-utils'
import { toggleCommentLike } from '@/lib/modules/social/social.service'
import { ok, fail, unauthorized } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(request)
  if (!userId) return unauthorized()
  const { id } = await params
  const commentId = parseInt(id, 10)
  if (isNaN(commentId)) return fail('无效 ID', 400)
  try { return ok(await toggleCommentLike(commentId, userId)) }
  catch (e: any) { return fail(e.message || '操作失败', 400) }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(request)
  if (!userId) return unauthorized()
  const { id } = await params
  const commentId = parseInt(id, 10)
  if (isNaN(commentId)) return fail('无效 ID', 400)
  try { return ok(await toggleCommentLike(commentId, userId)) }
  catch (e: any) { return fail(e.message || '操作失败', 400) }
}
