import { NextResponse } from 'next/server'
import { verifyPassword, signSession, getCredentials, initializeCredentialsFromEnv } from '@/lib/auth'

const DEFAULT_SESSION_HOURS = 5
const REMEMBER_SESSION_HOURS = 5

export async function POST(request: Request) {
  try {
    await initializeCredentialsFromEnv()

    const body = await request.json()
    const { username, password, rememberMe } = body

    if (!username || !password) {
      return NextResponse.json({ error: '请输入用户名和密码' }, { status: 400 })
    }

    const credentials = await getCredentials()

    if (!credentials.passwordHash) {
      return NextResponse.json(
        { error: '系统尚未配置访问密码' },
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

    const sessionHours = rememberMe ? REMEMBER_SESSION_HOURS : DEFAULT_SESSION_HOURS
    const sessionMs = sessionHours * 60 * 60 * 1000

    const sessionToken = await signSession({
      username,
      exp: Date.now() + sessionMs,
    })

    const response = NextResponse.json({ success: true, username })
    response.cookies.set('admin_session', sessionToken, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      maxAge: sessionMs / 1000,
      path: '/',
    })

    return response
  } catch {
    return NextResponse.json({ error: '登录失败' }, { status: 500 })
  }
}
