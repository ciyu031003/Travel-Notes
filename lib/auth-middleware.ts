import { NextRequest } from 'next/server'
import { verifySession, getSessionPayload } from './auth-utils'

export async function requireAuth(request: NextRequest) {
  const sessionCookie = request.cookies.get('admin_session')
  if (!sessionCookie) {
    return { authenticated: false, status: 401 }
  }

  const valid = await verifySession(sessionCookie.value)
  if (!valid) {
    return { authenticated: false, status: 401 }
  }

  const payload = getSessionPayload(sessionCookie.value)
  if (!payload) {
    return { authenticated: false, status: 401 }
  }

  return { authenticated: true, username: payload.username }
}
