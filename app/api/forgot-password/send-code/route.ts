import { NextResponse } from 'next/server'
import { getAuthService } from '@/lib/container'
import { rateLimit } from '@/lib/infrastructure/rate-limit'
import { getClientIp } from '@/lib/request-utils'

/** 防邮箱枚举（P1-12）：无论邮箱是否存在/是否验证，对外只有这一句话 */
const GENERIC_MESSAGE = '如果该邮箱已绑定账号，验证码将发送'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

    const body = await request.json().catch(() => ({}))
    const email = String(body?.email || '').trim()

    // 格式校验不属于「账号是否存在」的信息泄露，可以如实返回 400（前端此前已先行校验）
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: '请输入有效的邮箱地址' }, { status: 400 })
    }

    const emailLimit = rateLimit({ prefix: 'reset-code:email', key: email, limit: 3, windowMs: 15 * 60 * 1000 })
    if (!emailLimit.ok) {
      return NextResponse.json(
        { error: '该邮箱发送过于频繁，请稍后再试', retryAfterSeconds: emailLimit.retryAfterSeconds },
        { status: 429 }
      )
    }

    const authService = getAuthService()
    const result = await authService.sendResetCode(email, ip)

    // 冷却中仍返回 429（这是「刚发过」的限流语义，不暴露账号是否存在：
    // 未绑定邮箱时 sendResetCode 走的是「该邮箱未绑定账号」，不会命中冷却分支）
    if (result.remainingSeconds) {
      return NextResponse.json(
        { error: '发送过于频繁，请稍后再试', remainingSeconds: result.remainingSeconds },
        { status: 429 }
      )
    }

    // 未绑定/未验证/SMTP 失败：只记服务端日志，客户端一律 success（防枚举）
    if (!result.success) {
      console.warn('[forgot-password/send-code] 未发送验证码（原因不向客户端暴露）:', result.error)
    }

    return NextResponse.json({ success: true, message: GENERIC_MESSAGE })
  } catch (error) {
    console.error('[forgot-password/send-code] 失败:', (error as Error)?.message || error)
    // 异常也保持通用响应，避免通过 500/400 差异探测账号
    return NextResponse.json({ success: true, message: GENERIC_MESSAGE })
  }
}
