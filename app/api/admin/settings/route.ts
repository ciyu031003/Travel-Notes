import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getCredentials, verifyPassword, hashPassword, updateCredentials } from '@/lib/auth'

export async function GET(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const credentials = await getCredentials()
  return NextResponse.json({ username: credentials.username })
}

export async function POST(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { currentPassword, newUsername, newPassword } = body

    const credentials = await getCredentials()

    if (!currentPassword) {
      return NextResponse.json({ error: '请输入当前密码' }, { status: 400 })
    }

    const valid = await verifyPassword(currentPassword, credentials.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: '当前密码错误' }, { status: 401 })
    }

    const username = newUsername && newUsername.trim() ? newUsername.trim() : credentials.username

    if (newPassword && newPassword.trim()) {
      const passwordHash = await hashPassword(newPassword.trim())
      await updateCredentials(username, passwordHash)
    } else {
      await updateCredentials(username, credentials.passwordHash)
    }

    return NextResponse.json({ success: true, username })
  } catch {
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}