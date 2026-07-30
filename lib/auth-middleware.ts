import { NextRequest } from 'next/server'
import { verifySession, getSessionPayload, getFullSessionPayload } from './auth-utils'
import type { TokenPayload } from './services/token-service'

export interface AuthResult {
  authenticated: boolean
  status?: number
  username?: string
  payload?: TokenPayload
}

export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  const sessionCookie = request.cookies.get('admin_session')
  if (!sessionCookie || !sessionCookie.value) {
    return { authenticated: false, status: 401 }
  }

  const valid = await verifySession(sessionCookie.value)
  if (!valid) {
    return { authenticated: false, status: 401 }
  }

  const payload = await getFullSessionPayload(sessionCookie.value)
  if (!payload) {
    return { authenticated: false, status: 401 }
  }

  return {
    authenticated: true,
    username: payload.username,
    payload,
  }
}

export function requireAuthSync(request: NextRequest): AuthResult {
  const sessionCookie = request.cookies.get('admin_session')
  if (!sessionCookie || !sessionCookie.value) {
    return { authenticated: false, status: 401 }
  }

  const payload = getSessionPayload(sessionCookie.value)
  if (!payload) {
    return { authenticated: false, status: 401 }
  }

  if (payload.exp < Date.now()) {
    return { authenticated: false, status: 401 }
  }

  return {
    authenticated: true,
    username: payload.username,
  }
}