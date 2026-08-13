import { NextRequest } from 'next/server'
import { verifySession, getSessionPayload, getFullSessionPayload } from './auth-utils'
import { prismaSessionRepository } from './repositories/session-repository'
import type { TokenPayload } from './services/token-service'

export interface AuthResult {
  authenticated: boolean
  status?: number
  username?: string
  payload?: TokenPayload
  sessionId?: string
}

/**
 * 认证入口：JWT 签名校验（快速路径）+ Database-backed Session 校验（权威路径）。
 * Session 记录被撤销/过期后即使 JWT 未过期也会被拒绝，保证注销即时生效。
 */
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

  // 数据库会话校验：必须存在、未撤销、未过期
  if (payload.sid) {
    try {
      const session = await prismaSessionRepository.findById(payload.sid)
      if (!session) {
        return { authenticated: false, status: 401 }
      }
      const now = new Date()
      if (session.revokedAt || session.expiresAt.getTime() < now.getTime()) {
        return { authenticated: false, status: 401 }
      }
      // 节流更新 lastUsedAt
      await prismaSessionRepository.touchLastUsed(payload.sid, now).catch(() => {})
    } catch {
      // 数据库不可用时退化为 JWT 校验（避免单点故障）
      console.error('[requireAuth] Session DB check failed, fallback to JWT-only')
    }
  }

  return {
    authenticated: true,
    username: payload.username,
    payload,
    sessionId: payload.sid,
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
