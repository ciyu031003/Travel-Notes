import { NextRequest } from 'next/server'
import { requireUserId } from '@/lib/modules/social/social-route-utils'
import { reportPost } from '@/lib/modules/social/social.service'
import { ok, fail, unauthorized } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(request)
  if (!userId) return unauthorized()
  const { id } = await params
  const postId = parseInt(id, 10)
  if (isNaN(postId)) return fail('无效 ID', 400)
  try {
    const body = await request.json()
    return ok(await reportPost(postId, userId, body?.reason || ''))
  } catch (e: any) { return fail(e.message || '举报失败', 400) }
}
