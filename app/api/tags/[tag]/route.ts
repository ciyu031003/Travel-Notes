import { NextRequest } from 'next/server'
import { getPostService } from '@/lib/container'
import { ok, fail, serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tag: string }> }
) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || undefined
    const { tag } = await params

    if (!tag) {
      return fail('缺少必要参数 tag', 400)
    }

    const postService = getPostService()
    const posts = await postService.getPostsByTag(tag, type)
    return ok({ posts })
  } catch (error: any) {
    console.error('[GET /api/tags/[tag]] Error:', error?.message || error)
    return serverError()
  }
}
