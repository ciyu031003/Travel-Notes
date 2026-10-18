import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getMarkdownRenderer } from '@/lib/container'
import { ok, fail, unauthorized, ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { PreviewSchema } from '@/lib/api/schemas/admin'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return unauthorized()

  try {
    // P1-17：body 统一 zod（content 必填、上限 200KB）
    const { content } = await parseBody(request, PreviewSchema)

    const renderer = getMarkdownRenderer()
    const rendered = await renderer.render(content, { extractToc: true })
    return ok(rendered)
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    console.error('[Preview] Error:', error?.message)
    return fail(error.message || '渲染失败', 500)
  }
}
