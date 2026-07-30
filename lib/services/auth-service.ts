import { UserRepository } from '../repositories/user-repository'
import { TokenService } from '../services/token-service'
import { hashPassword, verifyPassword } from '../auth-utils'
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
  error?: string
}

export interface TokenPayload {
  username: string
  role?: string
  userId?: number
}

export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenService: TokenService,
  ) {}

  async login(username: string, password: string, rememberMe: boolean = false): Promise<LoginResult> {
    await this.userRepo.initializeFromEnv()

    const settings = await this.userRepo.getSettings()

    if (!settings.passwordHash) {
      return { success: false, error: '系统尚未配置访问密码' }
    }

    if (username !== settings.username) {
      return { success: false, error: '用户名或密码错误' }
    }

    const valid = await verifyPassword(password, settings.passwordHash)
    if (!valid) {
      return { success: false, error: '用户名或密码错误' }
    }

    const token = await this.tokenService.sign({ username, role: 'admin' })

    return {
      success: true,
      token,
      username: settings.username,
      requirePasswordChange: settings.requirePasswordChange,
    }
  }

  async verifyToken(token: string): Promise<TokenPayload | null> {
    return this.tokenService.verify(token)
  }

  async verifyTokenWithoutBlacklist(token: string): Promise<TokenPayload | null> {
    return this.tokenService.verifyWithoutBlacklist(token)
  }

  async logout(token: string): Promise<void> {
    await this.tokenService.blacklistToken(token)
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const settings = await this.userRepo.getSettings()

    const valid = await verifyPassword(currentPassword, settings.passwordHash)
    if (!valid) {
      return { success: false, error: '当前密码错误' }
    }

    const newHash = await hashPassword(newPassword)
    await this.userRepo.updateCredentials(settings.username, newHash, settings.email, true)

    return { success: true }
  }

  async adminChangePassword(newPassword: string): Promise<boolean> {
    return this.userRepo.forceChangePassword(newPassword)
  }

  async adminGetConfig(): Promise<{ requirePasswordChange: boolean }> {
    const settings = await this.userRepo.getSettings()
    return { requirePasswordChange: settings.requirePasswordChange }
  }

  async sendResetCode(email: string): Promise<{ success: boolean; code?: string; error?: string; remainingSeconds?: number }> {
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

    const status = getResetCodeStatus(email)
    if (!status.canSend) {
      return { success: false, error: `请在 ${status.remainingSeconds} 秒后重试`, remainingSeconds: status.remainingSeconds }
    }

    const code = generateVerificationCode()
    storeResetCode(email, code)

    return { success: true, code }
  }

  async verifyResetCode(email: string, code: string): Promise<{ success: boolean; error?: string }> {
    if (!email || !code || code.length !== 6) {
      return { success: false, error: '参数错误' }
    }

    const settings = await this.userRepo.getSettings()
    if (!settings.email || settings.email !== email) {
      return { success: false, error: '该邮箱未绑定账号' }
    }

    const valid = verifyResetCode(email, code)
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

    consumeResetCode(email)

    return { success: true }
  }
}
