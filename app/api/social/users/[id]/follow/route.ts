import { NextRequest } from 'next/server'
import { requireUserId } from '@/lib/modules/social/social-route-utils'
import { followUser, unfollowUser } from '@/lib/modules/social/social.service'
import { ok, fail, unauthorized } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(request)
  if (!userId) return unauthorized()
  const { id } = await params
  const targetId = parseInt(id, 10)
  if (isNaN(targetId)) return fail('无效 ID', 400)
  try { return ok(await followUser(userId, targetId)) }
  catch (e: any) { return fail(e.message || '关注失败', 400) }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(request)
  if (!userId) return unauthorized()
  const { id } = await params
  const targetId = parseInt(id, 10)
  if (isNaN(targetId)) return fail('无效 ID', 400)
  try { return ok(await unfollowUser(userId, targetId)) }
  catch (e: any) { return fail(e.message || '取关失败', 400) }
}
