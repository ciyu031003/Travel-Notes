import { NextRequest } from 'next/server'
import { requireUserId } from '@/lib/modules/social/social-route-utils'
import { listNotifications, markNotificationsRead } from '@/lib/modules/social/social.service'
import { ok, unauthorized, serverError, getPaginationFromSearchParams } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const userId = await requireUserId(request)
  if (!userId) return unauthorized()
  try {
    const { searchParams } = new URL(request.url)
    const { page, pageSize } = getPaginationFromSearchParams(searchParams, 20)
    return ok(await listNotifications(userId, page, pageSize))
  } catch (e: any) {
    console.error('[GET /api/social/notifications]', e?.message || e)
    return serverError()
  }
}

export async function PATCH(request: NextRequest) {
  const userId = await requireUserId(request)
  if (!userId) return unauthorized()
  try {
    const body = await request.json()
    const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter((n: number) => Number.isFinite(n)) : undefined
    return ok(await markNotificationsRead(userId, ids))
  } catch (e: any) {
    console.error('[PATCH /api/social/notifications]', e?.message || e)
    return serverError()
  }
}
