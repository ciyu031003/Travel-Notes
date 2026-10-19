import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { requireCapability } from '@/lib/capability-guard'
import { getMomentService } from '@/lib/container'
import { ok, serverError, unauthorized, ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { MomentCreateSchema, PaginationQuerySchema } from '@/lib/api/schemas/admin'
import { readIdempotencyKey, withIdempotency } from '@/lib/api/idempotency'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return unauthorized()

  try {
    // P1-17：分页 query 用 zod（coerce 正整数，上限由 schema 约束）
    const { searchParams } = new URL(request.url)
    const parsedQuery = PaginationQuerySchema.safeParse(Object.fromEntries(searchParams))
    if (!parsedQuery.success) {
      return errorResponse(new ApiError('INVALID_QUERY', '分页参数不合法', 400), getRequestId(request))
    }
    const page = parsedQuery.data.page ?? 1
    const pageSize = parsedQuery.data.pageSize ?? 50
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
    // P1-17：body 统一 zod（内容非空/≤2000、标签 ≤10 个）
    const body = await parseBody(request, MomentCreateSchema)
    const content = body.content
    const tags = (body.tags || []).map((t) => t.trim()).filter(Boolean).slice(0, 10)

    const momentService = getMomentService()
    // B4：幂等 —— 离线队列重放的同一 Idempotency-Key 直接返回首次创建的 id
    const idem = await withIdempotency({
      key: readIdempotencyKey(request),
      userId: auth.payload?.userId,
      entityType: 'Moment',
      run: async () => {
        const result = await momentService.createMoment(
          content,
          tags.length > 0 ? tags : null,
          auth.payload?.userId,
          Boolean(body.isPublic),
        )
        return { entityId: result.id, value: null as null }
      },
    })
    return ok({ id: idem.entityId }, '发布成功')
  } catch (error: any) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    console.error('[POST /api/admin/moments] Error:', error?.message || error)
    return serverError()
  }
}

