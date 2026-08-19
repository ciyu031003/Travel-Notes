import { NextRequest } from 'next/server'
import { getCurrentUserId } from '@/lib/current-user'
import { listSocialFeed, type SocialFeedTab } from '@/lib/modules/social/social.service'
import { paginatedResponse, serverError, getPaginationFromSearchParams } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tab = (searchParams.get('tab') || 'recommended') as SocialFeedTab
    const { page, pageSize } = getPaginationFromSearchParams(searchParams, 20)
    const userId = await getCurrentUserId()
    const result = await listSocialFeed({ tab, userId, page, pageSize })
    return paginatedResponse(result.data, result.total, page, pageSize)
  } catch (error: any) {
    console.error('[GET /api/social/posts]', error?.message || error)
    return serverError()
  }
}
