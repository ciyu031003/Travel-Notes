import { NextRequest } from 'next/server'
import { verifySession, getSessionPayload, getFullSessionPayload } from './auth-utils'
import { validateSession, touchSessionLastUsed } from './session'
import type { TokenPayload } from './services/token-service'

export interface AuthResult {
  authenticated: boolean
  status?: number
  username?: string
  payload?: TokenPayload
  sessionId?: string
  /** 数据库不可用导致无法校验会话（调用方应返回 5xx，而不是当成「未登录」） */
  databaseUnavailable?: boolean
}

/**
 * 认证入口：JWT 签名校验（快速路径）+ Database-backed Session 校验（权威路径，lib/session.ts）。
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

  // 数据库会话校验：必须存在、未撤销、未过期。
  // 关键（P1-10）：这里**不能**在数据库异常时退化为「仅 JWT 放行」——
  // 否则把数据库打挂就等于绕过全部会话撤销。会话校验失败即拒绝（fail-closed）。
  const session = await validateSession(payload.sid)
  if (!session.valid) {
    if (session.databaseUnavailable) {
      console.error('[requireAuth] 会话校验失败（数据库不可用），按未认证拒绝')
      return { authenticated: false, status: 503, databaseUnavailable: true }
    }
    return { authenticated: false, status: 401 }
  }

  // 节流更新 lastUsedAt（失败只影响统计）
  touchSessionLastUsed(payload.sid)

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
