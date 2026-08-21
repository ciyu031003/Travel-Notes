import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { getMomentService } from '@/lib/container'
import { ok, fail, serverError, unauthorized } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return unauthorized()

  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50')))
    const momentService = getMomentService()
    const result = await momentService.getMoments(page, pageSize, auth.payload?.userId)
    return ok(result)
  } catch (error: any) {
    console.error('[GET /api/admin/moments] Error:', error?.message || error)
    return serverError()
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return unauthorized()
  const denied = await requireCapability(auth.payload?.userId, 'canManageContent')
  if (denied) return denied

  try {
    const body = await request.json().catch(() => ({}))
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content) {
      return fail('内容不能为空')
    }
    if (content.length > 2000) {
      return fail('内容过长（最多 2000 字）')
    }

    const rawTags: string[] = Array.isArray(body.tags) ? body.tags.map(String) : []
    const tags = rawTags
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10)

    const momentService = getMomentService()
    const result = await momentService.createMoment(content, tags.length > 0 ? tags : null, auth.payload?.userId, Boolean(body?.isPublic))
    return ok(result, '发布成功')
  } catch (error: any) {
    console.error('[POST /api/admin/moments] Error:', error?.message || error)
    return serverError()
  }
}

