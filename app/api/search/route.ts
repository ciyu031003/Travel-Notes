import { NextRequest } from 'next/server'
import { getPostService } from '@/lib/container'
import { ok, fail, serverError } from '@/lib/api-response'
import { applyCacheControl } from '@/lib/http-cache'
import { rateLimit } from '@/lib/infrastructure/rate-limit'
import { getClientIp } from '@/lib/request-utils'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim()

    if (!q) {
      return ok({ results: [] })
    }

    if (q.length < 2) {
      return fail('关键词至少 2 个字符', 400)
    }

    // 阶段 A · A6：搜索为全表扫描类查询，按 IP 限流防止滥用
    const ip = getClientIp(request)
    const limit = rateLimit({ prefix: 'search:ip', key: ip || 'unknown', limit: 15, windowMs: 60_000 })
    if (!limit.ok) {
      return fail('搜索过于频繁，请稍后再试', 429)
    }

    const { getCurrentUserId } = await import('@/lib/current-user')
    const userId = await getCurrentUserId()
    const postService = getPostService()
    const results = await postService.searchAllPosts(q, userId)
    const res = ok({ results })
    return applyCacheControl(res, 'user', !!userId)
  } catch (error: any) {
    console.error('[GET /api/search] Error:', error?.message || error)
    return serverError()
  }
}
