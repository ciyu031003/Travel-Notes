import { NextResponse } from 'next/server'
import { getAuthService } from '@/lib/container'
import { rateLimit } from '@/lib/infrastructure/rate-limit'
import { getClientIp } from '@/lib/request-utils'

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    // IP 维度：每 15 分钟最多 5 次发送；邮箱维度：每 15 分钟最多 3 次
    const ipLimit = rateLimit({ prefix: 'reset-code:ip', key: ip || 'unknown', limit: 5, windowMs: 15 * 60 * 1000 })
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: '发送过于频繁，请稍后再试', retryAfterSeconds: ipLimit.retryAfterSeconds },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { email } = body

    const emailLimit = rateLimit({ prefix: 'reset-code:email', key: String(email || ''), limit: 3, windowMs: 15 * 60 * 1000 })
    if (!emailLimit.ok) {
      return NextResponse.json(
        { error: '该邮箱发送过于频繁，请稍后再试', retryAfterSeconds: emailLimit.retryAfterSeconds },
        { status: 429 }
      )
    }

    const authService = getAuthService()
    const result = await authService.sendResetCode(email, ip)

    if (!result.success) {
      const statusCode = result.remainingSeconds ? 429 : 400
      return NextResponse.json({ error: result.error, remainingSeconds: result.remainingSeconds }, { status: statusCode })
    }

    return NextResponse.json({
      success: true,
      message: '验证码已发送到您的邮箱，请在 5 分钟内完成验证',
    })
  } catch {
    return NextResponse.json({ error: '发送失败' }, { status: 500 })
  }
}
