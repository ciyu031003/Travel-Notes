import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getAuthService } from '@/lib/container'

export async function GET(request: Request) {
  const result = await requireAuth(request as any)
  if (!result.authenticated) {
    return NextResponse.json({ authenticated: false }, { status: 200 })
  }

  const authService = getAuthService()
  const settings = await authService.adminGetConfig()

  return NextResponse.json({
    authenticated: true,
    username: result.username,
    requirePasswordChange: settings.requirePasswordChange,
  })
}
