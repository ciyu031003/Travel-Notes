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

    return NextResponse.json({
      success: true,
      message: '验证码已发送到您的邮箱，请在 5 分钟内完成验证',
    })
  } catch {
    return NextResponse.json({ error: '发送失败' }, { status: 500 })
  }
}
