import { NextRequest } from 'next/server'
import { getPostService } from '@/lib/container'
import { ok, fail, serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const keyword = (searchParams.get('q') || '').trim()
    const type = searchParams.get('type') || undefined

    if (!keyword) {
      return ok([])
    }

    if (keyword.length < 2) {
      return fail('关键词至少 2 个字符', 400)
    }

    const postService = getPostService()
    const posts = await postService.searchPosts(keyword, type)
    return ok(posts)
  } catch (error: any) {
    console.error('[GET /api/blog/search] Error:', error?.message || error)
    return serverError()
  }
}
