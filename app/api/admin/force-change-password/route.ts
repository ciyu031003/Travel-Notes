import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { forceChangePassword, isRequirePasswordChange } from '@/lib/auth'

export async function GET() {
  try {
    const requireChange = await isRequirePasswordChange()
    return NextResponse.json({ requirePasswordChange: requireChange })
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

    const success = await forceChangePassword(newPassword)
    if (success) {
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json({ error: '修改密码失败' }, { status: 500 })
    }
  } catch {
    return NextResponse.json({ error: '修改密码失败' }, { status: 500 })
  }
}
