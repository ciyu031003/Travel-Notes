import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { verifyPassword, hashPassword, updateCredentials, getSiteSettings } from '@/lib/auth'

export async function POST(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword) {
      return NextResponse.json({ error: '请输入当前密码' }, { status: 400 })
    }

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: '新密码至少需要 6 位字符' }, { status: 400 })
    }

    const settings = await getSiteSettings()

    const valid = await verifyPassword(currentPassword, settings.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: '当前密码错误' }, { status: 401 })
    }

    if (newPassword === currentPassword) {
      return NextResponse.json({ error: '新密码不能与当前密码相同' }, { status: 400 })
    }

    const passwordHash = await hashPassword(newPassword)
    await updateCredentials(settings.username, passwordHash, settings.email)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}