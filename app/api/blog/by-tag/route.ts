import { NextRequest } from 'next/server'
import { getPostService } from '@/lib/container'
import { ok, fail, serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tag = searchParams.get('tag') || ''
    const type = searchParams.get('type') || undefined

    if (!tag) {
      return fail('缺少必要参数 tag', 400)
    }

    const postService = getPostService()
    const posts = await postService.getPostsByTag(tag, type)
    return ok(posts)
  } catch (error: any) {
    console.error('[GET /api/blog/by-tag] Error:', error?.message || error)
    return serverError()
  }
}
