import { NextRequest } from 'next/server'
import { getCurrentUserId } from '@/lib/current-user'
import { getMyProfile } from '@/lib/modules/social/profile.service'
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return unauthorized()
  try {
    const profile = await getMyProfile(userId)
    if (!profile) return notFound('用户不存在')
    return ok(profile)
  } catch (e: any) {
    console.error('[GET /api/me]', e?.message || e)
    return serverError()
  }
}
