import { NextRequest } from 'next/server'
import { requireUserId } from '@/lib/modules/social/social-route-utils'
import { setCommentLike } from '@/lib/modules/social/social.service'
import { ok, fail, unauthorized } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

/**
 * 评论点赞（幂等）：POST = 确保已赞，DELETE = 确保未赞。
 *
 * 为什么两个分支都写 `toggleCommentLike` 是错的（2026-10-17 修）：那样 POST 与 DELETE
 * 行为完全相同，客户端无法「重试」—— 乐观更新失败后重发一次，用户的赞反而被撤销。
 * 现在按目标状态落库（upsert / deleteMany），与帖子收藏的语义保持一致。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(request)
  if (!userId) return unauthorized()
  const { id } = await params
  const commentId = parseInt(id, 10)
  if (isNaN(commentId)) return fail('无效 ID', 400)
  try { return ok(await setCommentLike(commentId, userId, true)) }
  catch (e: any) { return fail(e.message || '操作失败', 400) }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(request)
  if (!userId) return unauthorized()
  const { id } = await params
  const commentId = parseInt(id, 10)
  if (isNaN(commentId)) return fail('无效 ID', 400)
  try { return ok(await setCommentLike(commentId, userId, false)) }
  catch (e: any) { return fail(e.message || '操作失败', 400) }
}
