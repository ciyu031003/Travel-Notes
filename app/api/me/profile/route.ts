import { NextRequest } from 'next/server'
import { getCurrentUserId } from '@/lib/current-user'
import { updateMyProfile } from '@/lib/modules/social/profile.service'
import { ok, unauthorized, fail, serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return unauthorized()
  try {
    const body = await request.json()
    const data = await updateMyProfile(userId, { nickname: body?.nickname, bio: body?.bio })
    return ok(data)
  } catch (e: any) {
    if (e?.message && /昵称|签名|用户不存在/.test(e.message)) return fail(e.message, 400)
    console.error('[PATCH /api/me/profile]', e?.message || e)
    return serverError()
  }
}
