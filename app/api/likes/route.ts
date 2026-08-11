import { NextRequest } from 'next/server'
import { getLikeService } from '@/lib/container'
import { ok, fail, serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

const TARGET_TYPES = new Set(['post', 'moment'])

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const targetType = searchParams.get('targetType') || ''
    const targetId = searchParams.get('targetId') || ''
    const visitorId = searchParams.get('visitorId') || undefined

    if (!TARGET_TYPES.has(targetType) || !targetId) {
      return fail('参数不完整：targetType/targetId 必填')
    }

    const likeService = getLikeService()
    const state = await likeService.getState(targetType, targetId, visitorId)
    return ok(state)
  } catch (error: any) {
    console.error('[GET /api/likes] Error:', error?.message || error)
    return serverError()
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { targetType, targetId, visitorId } = body

    if (!TARGET_TYPES.has(targetType) || !targetId) {
      return fail('参数不完整：targetType/targetId 必填')
    }
    if (!visitorId || typeof visitorId !== 'string') {
      return fail('缺少访客标识')
    }

    const likeService = getLikeService()
    const state = await likeService.toggle(targetType, targetId, visitorId)
    return ok(state)
  } catch (error: any) {
    console.error('[POST /api/likes] Error:', error?.message || error)
    if (error?.message?.includes('访客标识')) {
      return fail(error.message)
    }
    return serverError()
  }
}
