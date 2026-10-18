import { NextRequest, NextResponse } from 'next/server'
import { getAuthService } from '@/lib/container'
import { RegisterSchema } from '@/lib/validators/auth.validator'
import { DEFAULT_SESSION_SECONDS } from '@/lib/services/auth-service'
import { sessionCookieOptions } from '@/lib/auth-utils'
import { rateLimit } from '@/lib/infrastructure/rate-limit'
import { getClientIp, getUserAgent } from '@/lib/request-utils'
import { ApiError } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { errorResponse } from '@/lib/api-response'

// 注册限流：IP 每分钟最多 10 次
const IP_WINDOW_MS = 60 * 1000
const IP_LIMIT = 10

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request)
  try {
    const ip = getClientIp(request)
    const limit = rateLimit({ prefix: 'register:ip', key: ip || 'unknown', limit: IP_LIMIT, windowMs: IP_WINDOW_MS })
    if (!limit.ok) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试', code: 'RATE_LIMITED', retryAfterSeconds: limit.retryAfterSeconds, requestId },
        { status: 429 }
      )
    }

    // P1-17：body 校验统一 zod；密码策略（≥8 + 弱口令）在 PasswordSchema（P1-12）
    const body = await parseBody(request, RegisterSchema)
    // clientType 由 zod schema 归一（'app' | 'web' | undefined），无效值不再被静默当成 web
    const clientType: 'app' | 'web' = body.clientType === 'app' ? 'app' : 'web'

    const authService = getAuthService()
    const result = await authService.register(body.username, body.password, body.rememberMe, {
      userAgent: getUserAgent(request),
      ip,
      clientType,
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || '注册失败', code: 'REGISTER_FAILED', requestId },
        { status: 400 }
      )
    }

    const response = NextResponse.json({
      success: true,
      username: result.username,
      requirePasswordChange: result.requirePasswordChange,
    })

    if (result.token) {
      // 与登录/续期共用同一 Cookie 属性实现（此前 App 注册分支漏了 secure:true，
      // 而 SameSite=None 不带 Secure 会被 WebView 直接丢弃 → 注册后登录态丢失）
      response.cookies.set(
        'admin_session',
        result.token,
        sessionCookieOptions(clientType, result.ttlSeconds || DEFAULT_SESSION_SECONDS),
      )
    }

    response.headers.set('X-Request-Id', requestId)
    return response
  } catch (error) {
    const res = errorResponse(error instanceof ApiError ? error : new ApiError('REGISTER_FAILED', '注册失败，请稍后重试', 500), requestId)
    res.headers.set('X-Request-Id', requestId)
    return res
  }
}
