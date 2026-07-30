import { NextRequest, NextResponse } from 'next/server'
import { getAuthService } from '@/lib/container'

export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get('admin_session')

  if (sessionCookie && sessionCookie.value) {
    const authService = getAuthService()
    await authService.logout(sessionCookie.value)
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set('admin_session', '', { maxAge: 0, path: '/' })
  return response
}
