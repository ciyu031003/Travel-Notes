import { NextRequest, NextResponse } from 'next/server'
import { getAuthService } from '@/lib/container'
import { validateRegister } from '@/lib/validators/auth.validator'
import { DEFAULT_SESSION_SECONDS } from '@/lib/services/auth-service'
import { rateLimit } from '@/lib/infrastructure/rate-limit'
import { getClientIp, getUserAgent } from '@/lib/request-utils'

// 注册限流：IP 每分钟最多 10 次
const IP_WINDOW_MS = 60 * 1000
const IP_LIMIT = 10

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    const limit = rateLimit({ prefix: 'register:ip', key: ip || 'unknown', limit: IP_LIMIT, windowMs: IP_WINDOW_MS })
    if (!limit.ok) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试', retryAfterSeconds: limit.retryAfterSeconds },
        { status: 429 }
      )
    }

    const body = await request.json()
    const validation = validateRegister(body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues?.[0]?.message || '注册信息不合法' }, { status: 400 })
    }

    const clientType: 'app' | 'web' = body?.clientType === 'app' ? 'app' : 'web'

    const authService = getAuthService()
    const result = await authService.register(
      validation.data.username,
      validation.data.password,
      validation.data.rememberMe,
      { userAgent: getUserAgent(request), ip, clientType },
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error || '注册失败' }, { status: 400 })
    }

    const response = NextResponse.json({
      success: true,
      username: result.username,
      requirePasswordChange: result.requirePasswordChange,
    })

    if (result.token) {
      response.cookies.set('admin_session', result.token, {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === 'true',
        sameSite: clientType === 'app' ? 'none' : 'lax',
        maxAge: result.ttlSeconds || DEFAULT_SESSION_SECONDS,
        path: '/',
      })
    }

    return response
  } catch {
    return NextResponse.json({ error: '注册失败' }, { status: 500 })
  }
}
