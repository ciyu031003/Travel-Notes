import { NextResponse } from 'next/server'
import { getAuthService } from '@/lib/container'
import { rateLimit } from '@/lib/infrastructure/rate-limit'
import { getClientIp } from '@/lib/request-utils'

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    // IP 维度：每 15 分钟最多 30 次验证尝试
    const ipLimit = rateLimit({ prefix: 'reset-verify:ip', key: ip || 'unknown', limit: 30, windowMs: 15 * 60 * 1000 })
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: '尝试过于频繁，请稍后再试', retryAfterSeconds: ipLimit.retryAfterSeconds },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { email, code } = body

    const authService = getAuthService()
    const result = await authService.verifyResetCode(email, code)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 401 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '验证失败' }, { status: 500 })
  }
}
