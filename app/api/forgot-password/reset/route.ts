import { NextResponse } from 'next/server'
import { getAuthService } from '@/lib/container'
import { rateLimitShared } from '@/lib/infrastructure/rate-limit-factory'
import { getClientIp } from '@/lib/request-utils'
import { ResetPasswordSchema } from '@/lib/validators/auth.validator'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'

export async function POST(request: Request) {
  const requestId = getRequestId(request)
  try {
    const ip = getClientIp(request)
    // IP 维度：每 15 分钟最多 20 次重置尝试
    const ipLimit = await rateLimitShared({ prefix: 'reset:ip', key: ip || 'unknown', limit: 20, windowMs: 15 * 60 * 1000 })
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: '尝试过于频繁，请稍后再试', code: 'RATE_LIMITED', retryAfterSeconds: ipLimit.retryAfterSeconds, requestId },
        { status: 429 }
      )
    }

    // P1-17：body 统一 zod 校验；P1-12：新密码走同一密码策略
    const body = await parseBody(request, ResetPasswordSchema)

    const authService = getAuthService()
    const result = await authService.resetPassword(body.email, body.code, body.newPassword)

    if (!result.success) {
      throw new ApiError('RESET_FAILED', result.error || '重置失败', 400)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const res = errorResponse(error, requestId)
    res.headers.set('X-Request-Id', requestId)
    return res
  }
}
