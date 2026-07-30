import bcrypt from 'bcryptjs'
import { signToken, verifyToken, blacklistToken, type TokenPayload } from './services/token-service'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
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