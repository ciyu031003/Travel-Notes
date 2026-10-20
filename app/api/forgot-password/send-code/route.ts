import { NextResponse } from 'next/server'
import { getAuthService } from '@/lib/container'
import { rateLimitShared } from '@/lib/infrastructure/rate-limit-factory'
import { getClientIp } from '@/lib/request-utils'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { SendCodeSchema } from '@/lib/api/schemas/admin'

/** 防邮箱枚举（P1-12）：无论邮箱是否存在/是否验证，对外只有这一句话 */
const GENERIC_MESSAGE = '如果该邮箱已绑定账号，验证码将发送'

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    // IP 维度：每 15 分钟最多 5 次发送；邮箱维度：每 15 分钟最多 3 次
    const ipLimit = await rateLimitShared({ prefix: 'reset-code:ip', key: ip || 'unknown', limit: 5, windowMs: 15 * 60 * 1000 })
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: '发送过于频繁，请稍后再试', retryAfterSeconds: ipLimit.retryAfterSeconds },
        { status: 429 }
      )
    }

    // P1-17：body 用 zod（邮箱格式；格式非法不属于账号枚举，可如实 400）
    const { email } = await parseBody(request, SendCodeSchema)

    const emailLimit = await rateLimitShared({ prefix: 'reset-code:email', key: email, limit: 3, windowMs: 15 * 60 * 1000 })
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
    // 非法请求体应如实 400（不属于账号枚举）；其它异常保持通用响应，避免通过 500/400 差异探测账号
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    console.error('[forgot-password/send-code] 失败:', (error as Error)?.message || error)
    return NextResponse.json({ success: true, message: GENERIC_MESSAGE })
  }
}
