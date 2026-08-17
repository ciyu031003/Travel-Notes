import { prisma } from '../db'
import { createHash, randomUUID } from 'crypto'
import { UserRepository } from '../repositories/user-repository'
import { TokenService } from '../services/token-service'
import { PrismaSessionRepository } from '../repositories/session-repository'
import { hashPassword, verifyPassword } from '../auth-utils'
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
}

export const DEFAULT_SESSION_SECONDS = 5 * 60 * 60 // 5 小时
export const REMEMBER_SESSION_SECONDS = 7 * 24 * 60 * 60 // 7 天

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

    const ttlSeconds = rememberMe ? REMEMBER_SESSION_SECONDS : DEFAULT_SESSION_SECONDS
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
    if (!password || password.length < 6) {
      return { success: false, error: '密码至少需要 6 位字符' }
    }

    const exists = await prisma.user.findUnique({ where: { username: name } })
    if (exists) {
      return { success: false, error: '该用户名已被注册' }
    }

    const passwordHash = await hashPassword(password)
    let user
    try {
      user = await prisma.user.create({
        data: { username: name, passwordHash, requirePasswordChange: false },
      })
    } catch (e: any) {
      if (e && e.code === 'P2002') {
        return { success: false, error: '该用户名已被注册' }
      }
      return { success: false, error: '注册失败，请稍后重试' }
    }

    const ttlSeconds = rememberMe ? REMEMBER_SESSION_SECONDS : DEFAULT_SESSION_SECONDS
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
      '【Travel-Notes】密码重置验证码',
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

    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: '密码至少需要 6 位字符' }
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
