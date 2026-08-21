import { NextResponse } from 'next/server'
import { getAuthService } from '@/lib/container'
import { validateLogin } from '@/lib/validators/auth.validator'
import { DEFAULT_SESSION_SECONDS } from '@/lib/services/auth-service'
import { rateLimit, checkLoginLock, recordLoginFailure, clearLoginFailures } from '@/lib/infrastructure/rate-limit'
import { getClientIp, getUserAgent } from '@/lib/request-utils'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'

// 登录限流：IP 每分钟最多 20 次；用户名每分钟最多 10 次
const IP_WINDOW_MS = 60 * 1000
const IP_LIMIT = 20
const USER_WINDOW_MS = 60 * 1000
const USER_LIMIT = 10

// 连续失败锁定：5 次失败后锁定 1 分钟起，指数退避，最长 30 分钟
const LOCK_MAX_FAILURES = 5
const LOCK_BASE_MS = 60 * 1000
const LOCK_MAX_MS = 30 * 60 * 1000

function loginLockKey(ip: string | null, username: string): string {
  return `login:${ip || 'unknown'}:${username}`
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const body = await request.json()
    const validation = validateLogin(body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.message }, { status: 400 })
    }

    const username = validation.data.username

    const ipLimit = rateLimit({ prefix: 'login:ip', key: ip || 'unknown', limit: IP_LIMIT, windowMs: IP_WINDOW_MS })
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试', retryAfterSeconds: ipLimit.retryAfterSeconds },
        { status: 429 }
      )
    }

    const userLimit = rateLimit({ prefix: 'login:user', key: username, limit: USER_LIMIT, windowMs: USER_WINDOW_MS })
    if (!userLimit.ok) {
      return NextResponse.json(
        { error: '该账号尝试过于频繁，请稍后再试', retryAfterSeconds: userLimit.retryAfterSeconds },
        { status: 429 }
      )
    }

    const lockKey = loginLockKey(ip, username)
    const lock = checkLoginLock(lockKey, { maxFailures: LOCK_MAX_FAILURES, baseLockMs: LOCK_BASE_MS, maxLockMs: LOCK_MAX_MS })
    if (lock.locked) {
      return NextResponse.json(
        { error: `失败次数过多，请 ${lock.retryAfterSeconds} 秒后重试`, retryAfterSeconds: lock.retryAfterSeconds },
        { status: 429 }
      )
    }

    const authService = getAuthService()
    const result = await authService.login(username, validation.data.password, validation.data.rememberMe, {
      userAgent: getUserAgent(request),
      ip,
    })

    if (!result.success) {
      const lockResult = recordLoginFailure(lockKey, { maxFailures: LOCK_MAX_FAILURES, baseLockMs: LOCK_BASE_MS, maxLockMs: LOCK_MAX_MS })
      if (lockResult.locked && lockResult.retryAfterSeconds > 0) {
        return NextResponse.json(
          { error: '用户名或密码错误', retryAfterSeconds: lockResult.retryAfterSeconds },
          { status: 401 }
        )
      }
      return NextResponse.json({ error: result.error || '登录失败' }, { status: 401 })
    }

    clearLoginFailures(lockKey)
    writeAuditLog({ username, action: 'LOGIN', ip, metadata: { rememberMe: !!validation.data.rememberMe } }).catch(() => {})

    const sessionSeconds = result.ttlSeconds || DEFAULT_SESSION_SECONDS

    const response = NextResponse.json({
      success: true,
      username: result.username,
      requirePasswordChange: result.requirePasswordChange,
    })

    if (result.token) {
      response.cookies.set('admin_session', result.token, {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === 'true',
        sameSite: 'lax',
        maxAge: sessionSeconds,
        path: '/',
      })
    }

    return response
  } catch (error) {
    console.error('[POST /api/login] failed:', error)
    return NextResponse.json({ error: '登录失败' }, { status: 500 })
  }
}
