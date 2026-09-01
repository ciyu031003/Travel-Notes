import { NextRequest } from 'next/server'
import { getCurrentUserId } from '@/lib/current-user'
import { listSocialFeed, type SocialFeedTab } from '@/lib/modules/social/social.service'
import { paginatedResponse, serverError, getPaginationFromSearchParams } from '@/lib/api-response'
import { applyCacheControl } from '@/lib/http-cache'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tab = (searchParams.get('tab') || 'recommended') as SocialFeedTab
    const { page, pageSize } = getPaginationFromSearchParams(searchParams, 20)
    const userId = await getCurrentUserId()
    const result = await listSocialFeed({ tab, userId, page, pageSize })
    const res = paginatedResponse(result.data, result.total, page, pageSize)
    return applyCacheControl(res, 'user', !!userId)
  } catch (error: any) {
    console.error('[GET /api/social/posts]', error?.message || error)
    return serverError()
  }
}
