import { prisma } from '../db'
import {
  getSiteSettings,
  updateCredentials,
  updateAnniversaryStart,
  updateEmail,
  setEmailVerified,
  forceChangePassword,
  generateResetToken,
  verifyResetToken,
  resetPasswordWithToken,
  clearResetToken,
  initializeCredentialsFromEnv,
  type SiteSettings,
} from '../auth'

export interface UserRepository {
  getSettings(): Promise<SiteSettings>
  updateCredentials(username: string, passwordHash: string, email?: string | null, clearRequireChange?: boolean): Promise<void>
  updateAnniversaryStart(date: string | null): Promise<void>
  updateEmail(email: string | null, verified?: boolean): Promise<void>
  setEmailVerified(): Promise<void>
  forceChangePassword(newPassword: string): Promise<boolean>
  generateResetToken(): Promise<{ token: string; exp: Date } | null>
  verifyResetToken(token: string): Promise<boolean>
  resetPasswordWithToken(token: string, newPassword: string): Promise<boolean>
  clearResetToken(): Promise<void>
  initializeFromEnv(): Promise<void>
}

export class PrismaUserRepository implements UserRepository {
  async getSettings(): Promise<SiteSettings> {
    return getSiteSettings()
  }

  async updateCredentials(
    username: string,
    passwordHash: string,
    email?: string | null,
    clearRequireChange: boolean = false
  ): Promise<void> {
    await updateCredentials(username, passwordHash, email, clearRequireChange)
  }

  async updateAnniversaryStart(date: string | null): Promise<void> {
    await updateAnniversaryStart(date)
  }

  async updateEmail(email: string | null, verified?: boolean): Promise<void> {
    await updateEmail(email, verified)
  }

  async setEmailVerified(): Promise<void> {
    await setEmailVerified()
  }

  async forceChangePassword(newPassword: string): Promise<boolean> {
    return forceChangePassword(newPassword)
  }

  async generateResetToken(): Promise<{ token: string; exp: Date } | null> {
    return generateResetToken()
  }

  async verifyResetToken(token: string): Promise<boolean> {
    return verifyResetToken(token)
  }

  async resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
    return resetPasswordWithToken(token, newPassword)
  }

  async clearResetToken(): Promise<void> {
    await clearResetToken()
  }

  async initializeFromEnv(): Promise<void> {
    await initializeCredentialsFromEnv()
  }
}

export const prismaUserRepository = new PrismaUserRepository()
