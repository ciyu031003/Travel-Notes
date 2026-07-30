import { NextResponse } from 'next/server'
import { getAuthService } from '@/lib/container'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, code, newPassword } = body

    const authService = getAuthService()
    const result = await authService.resetPassword(email, code, newPassword)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '重置失败' }, { status: 500 })
  }
}
