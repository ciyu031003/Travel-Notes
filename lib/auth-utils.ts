import bcrypt from 'bcryptjs'
import { signToken, verifyToken, blacklistToken, type TokenPayload } from './services/token-service'

/**
 * bcrypt cost（P1-12）：10 → 12。
 * 只影响**新生成**的哈希；旧哈希仍能正常校验（cost 编码在哈希串里），登录时无需迁移。
 * 代价：单次哈希 ~250-400ms（登录/注册/改密各一次），换取离线爆破成本提高 4 倍。
 */
const BCRYPT_COST = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function signSession(payload: object): Promise<string> {
  const { username, exp } = payload as { username: string; exp?: number }
  const ttlSeconds = exp ? Math.floor((exp - Date.now()) / 1000) : undefined

  return signToken({ username }, ttlSeconds)
}

export async function verifySession(token: string): Promise<boolean> {
  const payload = await verifyToken(token)
  return payload !== null
}

export function getSessionPayload(token: string): { username: string; exp: number } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const payload = JSON.parse(atob(parts[1]))
    return {
      username: payload.username,
      exp: payload.exp ? payload.exp * 1000 : Date.now() + 5 * 60 * 60 * 1000,
    }
  } catch {
    return null
  }
}

export async function blacklistSession(token: string): Promise<void> {
  await blacklistToken(token)
}

export async function getFullSessionPayload(token: string): Promise<TokenPayload | null> {
  return verifyToken(token)
}

export interface SessionCookieOptions {
  httpOnly: boolean
  secure: boolean
  sameSite: 'none' | 'lax'
  maxAge: number
  path: string
}

/**
 * 会话 Cookie 属性的唯一实现（P1-10 续期与登录/注册共用，避免三处漂移）。
 * - App（Capacitor 跨域壳）：SameSite=None 必须配 Secure，否则 WebView 拒收 Cookie；
 *   App 的 API base 恒为 HTTPS，故强制 Secure。
 * - Web（同源）：SameSite=Lax，Secure 由 COOKIE_SECURE 控制（本地 http 调试可关）。
 */
export function sessionCookieOptions(clientType: 'app' | 'web', maxAgeSeconds: number): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: clientType === 'app' ? true : process.env.COOKIE_SECURE === 'true',
    sameSite: clientType === 'app' ? 'none' : 'lax',
    maxAge: maxAgeSeconds,
    path: '/',
  }
}
