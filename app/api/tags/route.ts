import { NextRequest } from 'next/server'
import { getPostService } from '@/lib/container'
import { ok, serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || undefined

    const postService = getPostService()
    const tags = type
      ? await postService.getAllTags(type)
      : await postService.getAllTagsAcrossModules()
    return ok({ tags })
  } catch (error: any) {
    console.error('[GET /api/tags] Error:', error?.message || error)
    return serverError()
  }
}
