import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getAuthService } from '@/lib/container'
import { getSiteSettings } from '@/lib/auth'

export async function GET(request: Request) {
  const result = await requireAuth(request as any)
  if (!result.authenticated) {
    // 未登录时返回是否需要初始化（无管理员密码）
    let needsSetup = false
    try {
      const settings = await getSiteSettings()
      needsSetup = !settings.passwordHash
    } catch {}
    return NextResponse.json({ authenticated: false, needsSetup }, { status: 200 })
  }

  const authService = getAuthService()
  const settings = await authService.adminGetConfig()

  return NextResponse.json({
    authenticated: true,
    username: result.username,
    requirePasswordChange: settings.requirePasswordChange,
  })
}
