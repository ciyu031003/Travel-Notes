import { NextResponse } from 'next/server'
import { getSiteSettings } from '@/lib/auth'
import { 
  generateVerificationCode, 
  storeResetCode, 
  getResetCodeStatus 
} from '@/lib/verification'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: '请输入有效的邮箱地址' }, { status: 400 })
    }

    const settings = await getSiteSettings()
    if (!settings.email || settings.email !== email) {
      return NextResponse.json({ error: '该邮箱未绑定账号' }, { status: 404 })
    }

    if (!settings.emailVerified) {
      return NextResponse.json({ error: '该邮箱未验证，请联系管理员' }, { status: 400 })
    }

    const status = getResetCodeStatus(email)
    if (!status.canSend) {
      return NextResponse.json({ 
        error: `请在 ${status.remainingSeconds} 秒后重试`,
        remainingSeconds: status.remainingSeconds 
      }, { status: 429 })
    }

    const code = generateVerificationCode()
    storeResetCode(email, code)

    console.log(`[Forgot Password] Reset code for ${email}: ${code}`)

    return NextResponse.json({ 
      success: true, 
      message: '验证码已发送（演示模式：123456）',
      code 
    })
  } catch {
    return NextResponse.json({ error: '发送失败' }, { status: 500 })
  }
}