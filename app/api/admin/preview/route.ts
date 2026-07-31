import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getMarkdownRenderer } from '@/lib/container'
import { ok, fail, unauthorized } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return unauthorized()

  try {
    const body = await request.json()
    const { content } = body

    if (!content || typeof content !== 'string') {
      return fail('缺少 content', 400)
    }

    const renderer = getMarkdownRenderer()
    const rendered = await renderer.render(content, { extractToc: true })
    return ok(rendered)
  } catch (error: any) {
    console.error('[Preview] Error:', error?.message)
    return fail(error.message || '渲染失败', 500)
  }
}
