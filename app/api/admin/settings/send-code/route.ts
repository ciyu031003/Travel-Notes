import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import {
  generateVerificationCode,
  storeVerificationCode,
  getVerificationCodeStatus,
  isEmailDeliveryConfigured,
} from '@/lib/verification'

export async function POST(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { email } = body

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: '请输入有效的邮箱地址' }, { status: 400 })
    }

    const status = getVerificationCodeStatus(email)
    if (!status.canSend) {
      return NextResponse.json({
        error: `请在 ${status.remainingSeconds} 秒后重试`,
        remainingSeconds: status.remainingSeconds,
      }, { status: 429 })
    }

    const code = generateVerificationCode()
    storeVerificationCode(email, code)

    if (isEmailDeliveryConfigured()) {
      // TODO: 接入真实邮件服务（nodemailer/Resend/阿里云邮件等）后在此发送
      console.log(`[Email Verification] Send code to ${email}: ${code}`)
      return NextResponse.json({
        success: true,
        message: '验证码已发送到您的邮箱，请在 5 分钟内完成验证',
      })
    }

    // 未配置邮件服务：验证码仅写入服务端日志，不向前端回显
    console.log(`[Email Verification] Code for ${email}: ${code}（未配置邮件服务，仅本地调试）`)
    return NextResponse.json({
      success: true,
      message: '验证码已发送（未配置邮件服务，请查看服务器日志获取验证码）',
    })
  } catch {
    return NextResponse.json({ error: '发送失败' }, { status: 500 })
  }
}
