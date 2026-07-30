import { NextResponse } from 'next/server'
import { getAuthService } from '@/lib/container'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email } = body

    const authService = getAuthService()
    const result = await authService.sendResetCode(email)

    if (!result.success) {
      const statusCode = result.remainingSeconds ? 429 : 400
      return NextResponse.json({ error: result.error, remainingSeconds: result.remainingSeconds }, { status: statusCode })
    }

    console.log(`[Forgot Password] Reset code for ${email}: ${result.code}`)

    return NextResponse.json({
      success: true,
      message: '验证码已发送（演示模式：123456）',
      code: result.code,
    })
  } catch {
    return NextResponse.json({ error: '发送失败' }, { status: 500 })
  }
}
