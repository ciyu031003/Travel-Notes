import { NextRequest } from 'next/server'
import { requireUserId } from '@/lib/modules/social/social-route-utils'
import { setPostFavorite } from '@/lib/modules/social/social.service'
import { ok, fail, unauthorized } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

/**
 * 收藏（幂等）：POST = 确保已收藏，DELETE = 确保未收藏。
 *
 * 为什么不能两边都调 toggle：离线队列会重放（网络失败入队、恢复回放、失败退避重试），
 * 切换语义下一次重放就把用户的收藏撤销了。幂等语义可安全重放。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(request)
  if (!userId) return unauthorized()
  const { id } = await params
  const postId = parseInt(id, 10)
  if (isNaN(postId)) return fail('无效 ID', 400)
  try { return ok(await setPostFavorite(postId, userId, true)) }
  catch (e: any) { return fail(e.message || '操作失败', 400) }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(request)
  if (!userId) return unauthorized()
  const { id } = await params
  const postId = parseInt(id, 10)
  if (isNaN(postId)) return fail('无效 ID', 400)
  try { return ok(await setPostFavorite(postId, userId, false)) }
  catch (e: any) { return fail(e.message || '操作失败', 400) }
}
