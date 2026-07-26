import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { 
  generateVerificationCode, 
  storeVerificationCode, 
  getVerificationCodeStatus 
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
        remainingSeconds: status.remainingSeconds 
      }, { status: 429 })
    }

    const code = generateVerificationCode()
    storeVerificationCode(email, code)

    console.log(`[Email Verification] Code for ${email}: ${code}`)

    return NextResponse.json({ 
      success: true, 
      message: '验证码已发送（演示模式：123456）',
      code 
    })
  } catch {
    return NextResponse.json({ error: '发送失败' }, { status: 500 })
  }
}