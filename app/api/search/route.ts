import { NextRequest } from 'next/server'
import { getPostService } from '@/lib/container'
import { ok, fail, serverError } from '@/lib/api-response'

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

    const postService = getPostService()
    const results = await postService.searchAllPosts(q)
    return ok({ results })
  } catch (error: any) {
    console.error('[GET /api/search] Error:', error?.message || error)
    return serverError()
  }
}
