import { NextRequest } from 'next/server'
import { requireUserId } from '@/lib/modules/social/social-route-utils'
import { listMyFavorites } from '@/lib/modules/social/social.service'
import { paginatedResponse, unauthorized, serverError, getPaginationFromSearchParams } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const userId = await requireUserId(request)
  if (!userId) return unauthorized()
  try {
    const { searchParams } = new URL(request.url)
    const { page, pageSize } = getPaginationFromSearchParams(searchParams, 20)
    const result = await listMyFavorites(userId, page, pageSize)
    return paginatedResponse(result.data, result.total, page, pageSize)
  } catch (e: any) {
    console.error('[GET /api/social/me/favorites]', e?.message || e)
    return serverError()
  }
}
