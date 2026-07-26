import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getCredentials, verifyPassword, updateCredentials, getSiteSettings } from '@/lib/auth'

export async function POST(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { newUsername, currentPassword } = body

    if (!newUsername || !newUsername.trim()) {
      return NextResponse.json({ error: '用户名不能为空' }, { status: 400 })
    }

    if (!currentPassword) {
      return NextResponse.json({ error: '请输入当前密码' }, { status: 400 })
    }

    const settings = await getSiteSettings()

    const valid = await verifyPassword(currentPassword, settings.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: '当前密码错误' }, { status: 401 })
    }

    const username = newUsername.trim()
    if (username === settings.username) {
      return NextResponse.json({ error: '新用户名与当前用户名相同' }, { status: 400 })
    }

    await updateCredentials(username, settings.passwordHash, settings.email)

    return NextResponse.json({ success: true, username })
  } catch {
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}