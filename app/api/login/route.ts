import { NextResponse } from 'next/server'
import { getAuthService } from '@/lib/container'
import { validateLogin } from '@/lib/validators/auth.validator'

const DEFAULT_SESSION_HOURS = 5
const REMEMBER_SESSION_HOURS = 5

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const validation = validateLogin(body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.message }, { status: 400 })
    }

    const authService = getAuthService()
    const result = await authService.login(
      validation.data.username,
      validation.data.password,
      validation.data.rememberMe
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error || '登录失败' }, { status: 401 })
    }

    const sessionHours = validation.data.rememberMe ? REMEMBER_SESSION_HOURS : DEFAULT_SESSION_HOURS
    const sessionMs = sessionHours * 60 * 60 * 1000

    const response = NextResponse.json({
      success: true,
      username: result.username,
      requirePasswordChange: result.requirePasswordChange,
    })

    if (result.token) {
      response.cookies.set('admin_session', result.token, {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === 'true',
        sameSite: 'lax',
        maxAge: sessionMs / 1000,
        path: '/',
      })
    }

    return response
  } catch {
    return NextResponse.json({ error: '登录失败' }, { status: 500 })
  }
}
