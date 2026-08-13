import { NextRequest, NextResponse } from 'next/server'
import { getAuthService } from '@/lib/container'
import { writeAuditLog } from '@/lib/modules/audit/audit-log.service'
import { getClientIp } from '@/lib/request-utils'

export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get('admin_session')
  const ip = getClientIp(request)

  if (sessionCookie && sessionCookie.value) {
    const authService = getAuthService()
    const payload = await authService.verifyTokenWithoutBlacklist(sessionCookie.value)
    if (payload?.username) {
      writeAuditLog({ username: payload.username, action: 'LOGOUT', ip }).catch(() => {})
    }
    await authService.logout(sessionCookie.value)
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set('admin_session', '', { maxAge: 0, path: '/' })
  return response
}
