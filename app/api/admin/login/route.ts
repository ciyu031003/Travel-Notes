import { NextResponse } from 'next/server'
import { verifyPassword, signSession, getCredentials, initializeCredentialsFromEnv } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    await initializeCredentialsFromEnv()

    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json({ error: '请输入用户名和密码' }, { status: 400 })
    }

    const credentials = await getCredentials()

    if (!credentials.passwordHash) {
      return NextResponse.json(
        { error: '系统尚未配置管理员密码' },
        { status: 500 }
      )
    }

    if (username !== credentials.username) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
    }

    const valid = await verifyPassword(password, credentials.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
    }

    const sessionToken = await signSession({
      username,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })

    const response = NextResponse.json({
      success: true,
      username,
      requirePasswordChange: credentials.requirePasswordChange,
    })
    response.cookies.set('admin_session', sessionToken, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })

    return response
  } catch {
    return NextResponse.json({ error: '登录失败' }, { status: 500 })
  }
}
