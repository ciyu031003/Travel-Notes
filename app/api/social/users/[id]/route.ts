import { NextRequest } from 'next/server'
import { getCurrentUserId } from '@/lib/current-user'
import { getUserProfile } from '@/lib/modules/social/social.service'
import { ok, notFound, serverError, fail } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const targetId = parseInt(id, 10)
    if (isNaN(targetId)) return fail('无效 ID', 400)
    const viewerId = await getCurrentUserId()
    const profile = await getUserProfile(targetId, viewerId)
    if (!profile) return notFound('用户不存在')
    return ok(profile)
  } catch (e: any) {
    console.error('[GET /api/social/users/[id]]', e?.message || e)
    return serverError()
  }
}
