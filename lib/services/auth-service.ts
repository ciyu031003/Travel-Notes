import { prisma } from '../db'
import { createHash, randomUUID } from 'crypto'
import { UserRepository } from '../repositories/user-repository'
import { TokenService } from '../services/token-service'
import { PrismaSessionRepository } from '../repositories/session-repository'
import { hashPassword, verifyPassword } from '../auth-utils'
import { validatePassword } from '../validators/auth.validator'
import { generateAccountIdForUser } from '../account-id'
import { sendMail } from '../infrastructure/mailer'
import {
  generateVerificationCode,
  storeResetCode,
  getResetCodeStatus,
  verifyResetCode,
  consumeResetCode,
} from '../verification'

export interface LoginResult {
  success: boolean
  token?: string
  username?: string
  requirePasswordChange?: boolean
  ttlSeconds?: number
  error?: string
}

export interface TokenPayload {
  username: string
  role?: string
  userId?: number
  sid?: string
}

export interface LoginMeta {
  userAgent?: string | null
  ip?: string | null
  /** 'app' 表示移动端原生壳登录，签发持久会话（免 5h 过期）；默认 'web' */
  clientType?: 'app' | 'web'
}

export const DEFAULT_SESSION_SECONDS = 5 * 60 * 60 // 5 小时（Web 默认）
export const REMEMBER_SESSION_SECONDS = 7 * 24 * 60 * 60 // 7 天（Web 记住我）
/**
 * App 会话 90 天（P1-10：原 365 天过长，设备丢失/令牌泄露的窗口过大）。
 * 客户端无需重新登录：GET /api/check-auth 会在剩余 < 30 天时静默续期（同一 sid 重签）。
 */
export const APP_SESSION_SECONDS = 90 * 24 * 60 * 60
/** App 会话静默续期阈值：剩余有效期低于该值时续期 */
export const APP_SESSION_RENEW_BEFORE_SECONDS = 30 * 24 * 60 * 60

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  return createHash('sha256').update(String(ip)).digest('hex')
}

export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenService: TokenService,
    private readonly sessionRepo: PrismaSessionRepository,
  ) {}

  async login(
    username: string,
    password: string,
    rememberMe: boolean = false,
    meta: LoginMeta = {},
  ): Promise<LoginResult> {
    await this.userRepo.initializeFromEnv()

    const user = await prisma.user.findUnique({ where: { username } })

    if (!user) {
      return { success: false, error: '用户名或密码错误' }
    }

    if (!user.passwordHash) {
      return { success: false, error: '系统尚未配置访问密码' }
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return { success: false, error: '用户名或密码错误' }
    }

    const ttlSeconds = meta.clientType === 'app'
      ? APP_SESSION_SECONDS
      : rememberMe ? REMEMBER_SESSION_SECONDS : DEFAULT_SESSION_SECONDS
    const sid = randomUUID()
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000)

    await this.sessionRepo.create({
      id: sid,
      username: user.username,
      userId: user.id,
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ipHash: hashIp(meta.ip),
    })

    const token = await this.tokenService.sign(
      { username: user.username, role: 'admin', userId: user.id, sid },
      ttlSeconds,
    )

    return {
      success: true,
      token,
      username: user.username,
      requirePasswordChange: user.requirePasswordChange,
      ttlSeconds,
    }
  }

  /**
   * 注册新账号（内测开放注册）：用户名唯一，注册成功即自动登录。
   */
  async register(
    username: string,
    password: string,
    rememberMe: boolean = false,
    meta: LoginMeta = {},
  ): Promise<LoginResult> {
    const name = String(username || '').trim()
    if (!/^[\w\u4e00-\u9fa5]{2,20}$/.test(name)) {
      return { success: false, error: '用户名需为 2-20 位中文/字母/数字/下划线' }
    }
    // 密码策略统一（P1-12）：与 setup/重置/改密同一套规则（≥8 + 弱口令黑名单）
    const passwordCheck = validatePassword(password)
    if (!passwordCheck.valid) {
      return { success: false, error: passwordCheck.message }
    }

    const exists = await prisma.user.findUnique({ where: { username: name } })
    if (exists) {
      return { success: false, error: '该用户名已被注册' }
    }

    const passwordHash = await hashPassword(password)
    let user
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const accountId = generateAccountIdForUser({ username: name })
        user = await prisma.user.create({
          data: { username: name, passwordHash, requirePasswordChange: false, accountId },
        })
        break
      } catch (e: any) {
        if (e && e.code === 'P2002') {
          const exists = await prisma.user.findUnique({ where: { username: name } })
          if (exists) return { success: false, error: '该用户名已被注册' }
          continue
        }
        return { success: false, error: '注册失败，请稍后重试' }
      }
    }
    if (!user) return { success: false, error: '注册失败，请稍后重试' }

    const ttlSeconds = meta.clientType === 'app'
      ? APP_SESSION_SECONDS
      : rememberMe ? REMEMBER_SESSION_SECONDS : DEFAULT_SESSION_SECONDS
    const sid = randomUUID()
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000)

    await this.sessionRepo.create({
      id: sid,
      username: user.username,
      userId: user.id,
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ipHash: hashIp(meta.ip),
    })

    const token = await this.tokenService.sign(
      { username: user.username, role: 'admin', userId: user.id, sid },
      ttlSeconds,
    )

    return {
      success: true,
      token,
      username: user.username,
      requirePasswordChange: false,
      ttlSeconds,
    }
  }

  /**
   * App 会话静默续期（P1-10）：同一 sid 重新签发 JWT，并同步延长数据库会话有效期。
   * 返回 null 表示会话已失效/被撤销（调用方不应续期）。
   * 只改有效期，**不新建 sid**：这样设备列表里仍是一条会话，撤销语义不变。
   */
  async renewSession(sid: string, ttlSeconds: number): Promise<string | null> {
    const session = await this.sessionRepo.findById(sid)
    if (!session) return null
    if (session.revokedAt) return null
    if (session.expiresAt.getTime() <= Date.now()) return null

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
    await this.sessionRepo.extendExpiry(sid, expiresAt)
    return this.tokenService.sign(
      {
        username: session.username,
        role: 'admin',
        ...(session.userId ? { userId: session.userId } : {}),
        sid,
      },
      ttlSeconds,
    )
  }

  async verifyToken(token: string): Promise<TokenPayload | null> {
    return this.tokenService.verify(token)
  }

  async verifyTokenWithoutBlacklist(token: string): Promise<TokenPayload | null> {
    return this.tokenService.verifyWithoutBlacklist(token)
  }

  async logout(token: string): Promise<void> {
    const payload = await this.tokenService.verifyWithoutBlacklist(token)
    if (payload?.sid) {
      await this.sessionRepo.revoke(payload.sid)
    }
    await this.tokenService.blacklistToken(token)
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
    currentSid?: string | null,
  ): Promise<{ success: boolean; error?: string }> {
    const settings = await this.userRepo.getSettings()

    const valid = await verifyPassword(currentPassword, settings.passwordHash)
    if (!valid) {
      return { success: false, error: '当前密码错误' }
    }

    const newHash = await hashPassword(newPassword)
    await this.userRepo.updateCredentials(settings.username, newHash, settings.email, true)

    // 密码变更后撤销其它会话，仅保留当前会话
    await this.sessionRepo.revokeAllForUser(settings.username, currentSid ?? undefined)

    return { success: true }
  }

  async adminChangePassword(newPassword: string, currentSid?: string | null): Promise<boolean> {
    const ok = await this.userRepo.forceChangePassword(newPassword)
    if (ok) {
      const settings = await this.userRepo.getSettings()
      await this.sessionRepo.revokeAllForUser(settings.username, currentSid ?? undefined)
    }
    return ok
  }

  async adminGetConfig(): Promise<{ requirePasswordChange: boolean }> {
    const settings = await this.userRepo.getSettings()
    return { requirePasswordChange: settings.requirePasswordChange }
  }

  async sendResetCode(email: string, ip?: string | null): Promise<{ success: boolean; error?: string; remainingSeconds?: number; delivered?: boolean }> {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: '请输入有效的邮箱地址' }
    }

    const settings = await this.userRepo.getSettings()
    if (!settings.email || settings.email !== email) {
      return { success: false, error: '该邮箱未绑定账号' }
    }

    if (!settings.emailVerified) {
      return { success: false, error: '该邮箱未验证，请联系管理员' }
    }

    const status = await getResetCodeStatus(email)
    if (!status.canSend) {
      return { success: false, error: `请在 ${status.remainingSeconds} 秒后重试`, remainingSeconds: status.remainingSeconds }
    }

    const code = generateVerificationCode()
    await storeResetCode(email, code, ip ? hashIp(ip) : null)

    // 验证码不回显给客户端；未配置 SMTP 时仅写入服务端日志
    const delivered = await sendMail(
      email,
      '【甜途】密码重置验证码',
      `您的验证码是 ${code}，5 分钟内有效。`
    )
    return { success: true, delivered }
  }

  async verifyResetCode(email: string, code: string): Promise<{ success: boolean; error?: string }> {
    if (!email || !code || code.length !== 6) {
      return { success: false, error: '参数错误' }
    }

    const settings = await this.userRepo.getSettings()
    if (!settings.email || settings.email !== email) {
      return { success: false, error: '该邮箱未绑定账号' }
    }

    const valid = await verifyResetCode(email, code)
    if (!valid) {
      return { success: false, error: '验证码错误或已过期' }
    }

    return { success: true }
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    if (!email || !code || code.length !== 6) {
      return { success: false, error: '参数错误' }
    }

    const passwordCheck = validatePassword(newPassword)
    if (!passwordCheck.valid) {
      return { success: false, error: passwordCheck.message }
    }

    const settings = await this.userRepo.getSettings()
    if (!settings.email || settings.email !== email) {
      return { success: false, error: '该邮箱未绑定账号' }
    }

    const valid = verifyResetCode(email, code)
    if (!valid) {
      return { success: false, error: '验证码错误或已过期' }
    }

    const passwordHash = await hashPassword(newPassword)
    await this.userRepo.updateCredentials(settings.username, passwordHash, settings.email)

    await consumeResetCode(email)

    // 密码重置后撤销该账号全部会话，强制重新登录
    await this.sessionRepo.revokeAllForUser(settings.username)

    return { success: true }
  }

}
