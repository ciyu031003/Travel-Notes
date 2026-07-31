import { NextRequest } from 'next/server'
import { getPostService } from '@/lib/container'
import { ok, fail, serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || ''
    const date = searchParams.get('date') || ''

    if (!type || !date) {
      return fail('缺少必要参数 type 或 date', 400)
    }

    const postService = getPostService()
    const result = await postService.getAdjacentPosts(type, date)
    return ok(result)
  } catch (error: any) {
    console.error('[GET /api/blog/adjacent] Error:', error?.message || error)
    return serverError()
  }
}
