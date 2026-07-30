import { UserRepository } from '../repositories/user-repository'
import { CacheService } from '../infrastructure/cache'
import { verifyPassword, hashPassword } from '../auth-utils'
import type { SiteSettings } from '../auth'

export interface SiteConfigDTO {
  username: string
  email: string | null
  emailVerified: boolean
  requirePasswordChange: boolean
  anniversaryStart: string | null
}

export class SiteService {
  private readonly CACHE_TTL = 600

  constructor(
    private readonly userRepo: UserRepository,
    private readonly cache: CacheService,
  ) {}

  async getSiteConfig(): Promise<SiteConfigDTO> {
    const cacheKey = 'site:config'
    const cached = await this.cache.get<SiteConfigDTO>(cacheKey)
    if (cached) return cached

    const settings = await this.userRepo.getSettings()
    const dto = this.toDTO(settings)
    await this.cache.set(cacheKey, dto, this.CACHE_TTL, ['site'])
    return dto
  }

  async getSiteSettings(): Promise<SiteSettings> {
    return this.userRepo.getSettings()
  }

  async updateAnniversaryStart(date: string | null): Promise<void> {
    await this.userRepo.updateAnniversaryStart(date)
    await this.cache.deleteByTag('site')
  }

  async updateUsername(username: string, currentPassword: string): Promise<{ success: boolean; error?: string }> {
    const settings = await this.userRepo.getSettings()
    const valid = await verifyPassword(currentPassword, settings.passwordHash)
    if (!valid) {
      return { success: false, error: '当前密码错误' }
    }
    await this.userRepo.updateCredentials(username, settings.passwordHash, settings.email)
    await this.cache.deleteByTag('site')
    return { success: true }
  }

  async updatePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const settings = await this.userRepo.getSettings()
    const valid = await verifyPassword(currentPassword, settings.passwordHash)
    if (!valid) {
      return { success: false, error: '当前密码错误' }
    }
    const newHash = await hashPassword(newPassword)
    await this.userRepo.updateCredentials(settings.username, newHash, settings.email, true)
    await this.cache.deleteByTag('site')
    return { success: true }
  }

  async updateEmail(email: string | null, currentPassword?: string, skipPasswordCheck?: boolean): Promise<{ success: boolean; error?: string }> {
    if (!skipPasswordCheck && currentPassword) {
      const settings = await this.userRepo.getSettings()
      const valid = await verifyPassword(currentPassword, settings.passwordHash)
      if (!valid) {
        return { success: false, error: '当前密码错误' }
      }
    }
    await this.userRepo.updateEmail(email, skipPasswordCheck ? true : undefined)
    await this.cache.deleteByTag('site')
    return { success: true }
  }

  async sendVerificationCode(email: string): Promise<{ success: boolean; error?: string }> {
    return { success: true }
  }

  async verifyPassword(password: string): Promise<{ success: boolean; error?: string }> {
    const settings = await this.userRepo.getSettings()
    const valid = await verifyPassword(password, settings.passwordHash)
    if (!valid) {
      return { success: false, error: '当前密码错误' }
    }
    return { success: true }
  }

  private toDTO(settings: SiteSettings): SiteConfigDTO {
    return {
      username: settings.username,
      email: settings.email,
      emailVerified: settings.emailVerified,
      requirePasswordChange: settings.requirePasswordChange,
      anniversaryStart: settings.anniversaryStart,
    }
  }
}
