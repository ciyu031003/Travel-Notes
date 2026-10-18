import { NextRequest } from 'next/server'
import { ApiError, ok, unauthorized, serverError, getPaginationFromSearchParams } from '@/lib/api-response'
import { withAuth } from '@/lib/api/handler'
import { parseOptionalBody } from '@/lib/api/schemas/common'
import { requireUserId } from '@/lib/modules/social/social-route-utils'
import { listNotifications, markNotificationsRead } from '@/lib/modules/social/social.service'
import { MarkNotificationsReadSchema } from '@/lib/api/schemas/social'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const userId = await requireUserId(request)
  if (!userId) return unauthorized()
  try {
    const { searchParams } = new URL(request.url)
    const { page, pageSize } = getPaginationFromSearchParams(searchParams, 20)
    return ok(await listNotifications(userId, page, pageSize))
  } catch (e: any) {
    console.error('[GET /api/social/notifications]', e?.message || e)
    return serverError()
  }
}

/**
 * 标记通知已读：body 可省略（= 全部标记已读）。
 * P1-17：ids 由 zod 校验（正整数数组、最多 500 条），无 body 时保持"全部已读"原语义。
 */
export const PATCH = withAuth(async (request, ctx) => {
  if (!ctx.userId) throw new ApiError('UNAUTHORIZED', '未授权', 401)
  const body = await parseOptionalBody(request, MarkNotificationsReadSchema)
  try {
    return ok(await markNotificationsRead(ctx.userId, body?.ids))
  } catch {
    throw new ApiError('UPDATE_FAILED', '标记失败', 400)
  }
})
