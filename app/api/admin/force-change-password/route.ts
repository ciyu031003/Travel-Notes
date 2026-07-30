import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getAuthService } from '@/lib/container'

export async function GET() {
  try {
    const authService = getAuthService()
    const settings = await authService.adminGetConfig()
    return NextResponse.json({ requirePasswordChange: settings.requirePasswordChange })
  } catch {
    return NextResponse.json({ requirePasswordChange: false })
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuth(request as any)
    if (!authResult.authenticated) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const body = await request.json()
    const { newPassword } = body

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: '新密码至少 6 位' }, { status: 400 })
    }

    const authService = getAuthService()
    const success = await authService.adminChangePassword(newPassword)
    if (success) {
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json({ error: '修改密码失败' }, { status: 500 })
    }
  } catch {
    return NextResponse.json({ error: '修改密码失败' }, { status: 500 })
  }
}
