import { NextRequest } from 'next/server'
import { getMyProfile } from '@/lib/modules/social/profile.service'
import { ok, unauthorized, notFound, ApiError } from '@/lib/api-response'
import { withAuth } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

/**
 * 当前用户资料（P1-10 验收路径）：
 * 走 withAuth 后，数据库不可用会返回 503 而不是「未登录 401 放行」，
 * 会话被撤销/过期则 401 —— 这也是验收「撤销 session 后 /api/me 401」的入口。
 */
export const GET = withAuth(async (_request: NextRequest, ctx) => {
  if (!ctx.userId) return unauthorized()
  const profile = await getMyProfile(ctx.userId)
  if (!profile) throw new ApiError('NOT_FOUND', '用户不存在', 404)
  return ok(profile)
})
