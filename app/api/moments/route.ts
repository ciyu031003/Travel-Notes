import { NextRequest } from 'next/server'
import { getMomentService } from '@/lib/container'
import { ok, serverError, getPaginationFromSearchParams } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const { page, pageSize } = getPaginationFromSearchParams(searchParams, 20)
    const momentService = getMomentService()
    const result = await momentService.getMoments(page, pageSize)
    return ok(result)
  } catch (error: any) {
    console.error('[GET /api/moments] Error:', error?.message || error)
    return serverError()
  }
}
