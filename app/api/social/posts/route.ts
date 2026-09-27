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
    // 同行关系筛选（独旅/与TA/与家人...）：无效值在 service 内回落为不过滤
    const travelType = searchParams.get('travelType')
    const result = await listSocialFeed({ tab, userId, page, pageSize, travelType })
    const res = paginatedResponse(result.data, result.total, page, pageSize)
    return applyCacheControl(res, 'user', !!userId)
  } catch (error: any) {
    console.error('[GET /api/social/posts]', error?.message || error)
    return serverError()
  }
}
