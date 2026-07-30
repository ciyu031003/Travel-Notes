import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.SESSION_SECRET || 'your-secret-key-change-in-production'
)

const DEFAULT_TTL = 5 * 60 * 60 // 5 hours

export interface TokenPayload extends JWTPayload {
  username: string
  role?: string
  userId?: number
}

export interface TokenServiceConfig {
  ttl?: number
  issuer?: string
}

class TokenBlacklist {
  private blacklist = new Map<string, number>()
  private maxSize = 10000

  add(tokenId: string, expireAt: number): void {
    if (this.blacklist.size >= this.maxSize) {
      this.evict()
    }
    this.blacklist.set(tokenId, expireAt)
  }

  isBlacklisted(tokenId: string): boolean {
    const expireAt = this.blacklist.get(tokenId)
    if (!expireAt) return false
    if (Date.now() > expireAt) {
      this.blacklist.delete(tokenId)
      return false
    }
    return true
  }

  remove(tokenId: string): void {
    this.blacklist.delete(tokenId)
  }

  private evict(): void {
    let oldestKey: string | null = null
    let oldestExpire = Infinity

    this.blacklist.forEach((expireAt, key) => {
      if (expireAt < oldestExpire) {
        oldestExpire = expireAt
        oldestKey = key
      }
    })

    if (oldestKey) {
      this.blacklist.delete(oldestKey)
    } else {
      const firstKey = this.blacklist.keys().next().value
      if (firstKey) {
        this.blacklist.delete(firstKey as string)
      }
    }
  }
}

const blacklist = new TokenBlacklist()

export class TokenService {
  private readonly secret: Uint8Array
  private readonly ttl: number
  private readonly issuer: string

  constructor(config: TokenServiceConfig = {}) {
    this.secret = JWT_SECRET
    this.ttl = config.ttl || DEFAULT_TTL
    this.issuer = config.issuer || 'travel-notes'
  }

  async sign(payload: Omit<TokenPayload, 'iat' | 'exp' | 'jti'>, ttlSeconds?: number): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    const tokenId = crypto.randomUUID()
    const expireAt = now + (ttlSeconds || this.ttl)

    return new SignJWT({
      ...payload,
      jti: tokenId,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(expireAt)
      .setIssuer(this.issuer)
      .sign(this.secret)
  }

  async verify(token: string): Promise<TokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: this.issuer,
      })

      if (payload.jti && blacklist.isBlacklisted(payload.jti as string)) {
        return null
      }

      return payload as TokenPayload
    } catch {
      return null
    }
  }

  async verifyWithoutBlacklist(token: string): Promise<TokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: this.issuer,
      })
      return payload as TokenPayload
    } catch {
      return null
    }
  }

  async blacklistToken(token: string): Promise<void> {
    const payload = await this.verifyWithoutBlacklist(token)
    if (payload && payload.jti && payload.exp) {
      blacklist.add(payload.jti as string, payload.exp as number * 1000)
    }
  }

  async refresh(token: string, ttlSeconds?: number): Promise<string | null> {
    const payload = await this.verify(token)
    if (!payload) return null

    const { jti, exp, iat, ...rest } = payload
    return this.sign(rest as Omit<TokenPayload, 'iat' | 'exp' | 'jti'>, ttlSeconds)
  }

  getBlacklistStats(): { size: number } {
    return { size: (blacklist as any).blacklist.size }
  }
}

export const tokenService = new TokenService()

export async function signToken(payload: Omit<TokenPayload, 'iat' | 'exp' | 'jti'>, ttlSeconds?: number): Promise<string> {
  return tokenService.sign(payload, ttlSeconds)
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  return tokenService.verify(token)
}

export async function blacklistToken(token: string): Promise<void> {
  return tokenService.blacklistToken(token)
}

export async function refreshToken(token: string, ttlSeconds?: number): Promise<string | null> {
  return tokenService.refresh(token, ttlSeconds)
}