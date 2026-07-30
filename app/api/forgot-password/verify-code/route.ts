import { NextResponse } from 'next/server'
import { getAuthService } from '@/lib/container'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, code } = body

    const authService = getAuthService()
    const result = await authService.verifyResetCode(email, code)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 401 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '验证失败' }, { status: 500 })
  }
}
