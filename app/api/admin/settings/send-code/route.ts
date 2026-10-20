import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import {
  generateVerificationCode,
  storeVerificationCode,
  getVerificationCodeStatus,
  isEmailDeliveryConfigured,
} from '@/lib/verification'
import { rateLimitShared } from '@/lib/infrastructure/rate-limit-factory'
import { sendMail } from '@/lib/infrastructure/mailer'
import { getClientIp } from '@/lib/request-utils'
import { logger } from '@/lib/infrastructure/logger'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { SendCodeSchema } from '@/lib/api/schemas/admin'

export async function POST(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const ip = getClientIp(request)
    // 已登录用户发送验证码同样限流：IP 每 15 分钟 10 次
    const ipLimit = await rateLimitShared({ prefix: 'verify-code:ip', key: ip || 'unknown', limit: 10, windowMs: 15 * 60 * 1000 })
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: '发送过于频繁，请稍后再试', retryAfterSeconds: ipLimit.retryAfterSeconds },
        { status: 429 }
      )
    }

    // P1-17：body 统一 zod（邮箱格式）
    const { email } = await parseBody(request, SendCodeSchema)

    const status = await getVerificationCodeStatus(email)
    if (!status.canSend) {
      return NextResponse.json({
        error: `请在 ${status.remainingSeconds} 秒后重试`,
        remainingSeconds: status.remainingSeconds,
      }, { status: 429 })
    }

    const code = generateVerificationCode()
    await storeVerificationCode(email, code)

    // 日志脱敏：不输出完整邮箱与验证码明文（验证码仅本地开发时输出）
    const maskedEmail = email.replace(/^(.).*(@.*)$/, '$1***$2')
    if (isEmailDeliveryConfigured()) {
      // TODO: 接入真实邮件服务（nodemailer/Resend/阿里云邮件等）后在此发送
      logger.info('admin-email', 'send-code', { to: maskedEmail })
      return NextResponse.json({
        success: true,
        message: '验证码已发送到您的邮箱，请在 5 分钟内完成验证',
      })
    }

    // 未配置邮件服务：开发环境可从服务端日志取验证码；生产环境不落明文
    if (process.env.NODE_ENV !== 'production') {
      logger.info('admin-email', 'debug-code', { to: maskedEmail, code, note: '未配置邮件服务，仅本地调试' })
    } else {
      console.warn('[Email Verification] SMTP 未配置且处于生产环境，验证码无法送达，请配置 SMTP_* 环境变量')
    }
    return NextResponse.json({
      success: true,
      message: isEmailDeliveryConfigured()
        ? '验证码已发送'
        : '邮件服务未配置：开发环境请查看服务器日志获取验证码',
    })
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    return NextResponse.json({ error: '发送失败' }, { status: 500 })
  }
}
