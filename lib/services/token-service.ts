import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import type { TokenBlacklistRepository } from '../repositories/token-blacklist-repository'

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      // 生产环境缺失密钥时直接拒绝启动，避免使用不安全的默认密钥
      throw new Error('[FATAL] JWT_SECRET 未配置：请设置 JWT_SECRET（可用 `openssl rand -hex 32` 生成）')
    }
    console.warn('[WARN] JWT_SECRET 未配置：使用开发环境默认密钥，切勿用于生产')
    return 'dev-only-insecure-secret'
  }
  return secret
}

const JWT_SECRET = new TextEncoder().encode(resolveJwtSecret())

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

  /**
   * 由服务端容器注入持久化黑名单仓库。
   * 通过注入而非构造参数，避免客户端组件（如 /admin/setup）经 auth-utils
   * 传递依赖时把 Prisma（Node 内置模块）打进浏览器包。
   */
  attachBlacklistRepository(repo: TokenBlacklistRepository): void {
    this.blacklistRepo = repo
  }

  private blacklistRepo?: TokenBlacklistRepository

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

      if (payload.jti) {
        const jti = payload.jti as string
        if (blacklist.isBlacklisted(jti)) {
          return null
        }
        // 内存未命中时兜底查询持久化黑名单，保证进程重启后注销仍然生效
        if (this.blacklistRepo && (await this.blacklistRepo.isBlacklisted(jti))) {
          const expireMs = typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now() + DEFAULT_TTL * 1000
          blacklist.add(jti, expireMs)
          return null
        }
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
      const expireMs = payload.exp as number * 1000
      blacklist.add(payload.jti as string, expireMs)
      if (this.blacklistRepo) {
        await this.blacklistRepo.add(payload.jti as string, new Date(expireMs))
      }
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
