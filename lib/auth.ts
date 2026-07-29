import { prisma } from './db'
import { hashPassword, verifyPassword, signSession, verifySession, getSessionPayload } from './auth-utils'
import { getCachedSiteSettings, invalidateSiteSettingsCache } from './cache'

export { hashPassword, verifyPassword, signSession, verifySession, getSessionPayload }

const DEFAULT_USERNAME = 'yuanabd'
const DEFAULT_PASSWORD = 'Abd123456.'

export interface SiteSettings {
  username: string
  passwordHash: string
  email: string | null
  emailVerified: boolean
  requirePasswordChange: boolean
  anniversaryStart: string | null
}

function mapSetting(setting: any): SiteSettings {
  return {
    username: setting.username,
    passwordHash: setting.passwordHash,
    email: setting.email,
    emailVerified: setting.emailVerified,
    requirePasswordChange: (setting as any).requirePasswordChange ?? false,
    anniversaryStart: (setting as any).anniversaryStart ?? null,
  }
}

async function fetchSiteSettingsFromDB(): Promise<SiteSettings> {
  try {
    const setting = await prisma.siteSetting.findFirst({
      orderBy: { id: 'asc' },
    })
    if (setting) {
      return mapSetting(setting)
    }
  } catch {
    const envPasswordHash = process.env.ADMIN_PASSWORD_HASH
    if (envPasswordHash) {
      return {
        username: process.env.ADMIN_USERNAME || DEFAULT_USERNAME,
        passwordHash: envPasswordHash,
        email: null,
        emailVerified: false,
        requirePasswordChange: false,
        anniversaryStart: null,
      }
    }
    const defaultPasswordHash = await hashPassword(DEFAULT_PASSWORD)
    return {
      username: DEFAULT_USERNAME,
      passwordHash: defaultPasswordHash,
      email: null,
      emailVerified: false,
      requirePasswordChange: false,
      anniversaryStart: null,
    }
  }

  await initializeDefaultAdmin()

  try {
    const setting = await prisma.siteSetting.findFirst({
      orderBy: { id: 'asc' },
    })
    if (setting) {
      return mapSetting(setting)
    }
  } catch {}

  const envPasswordHash = process.env.ADMIN_PASSWORD_HASH
  if (envPasswordHash) {
    return {
      username: process.env.ADMIN_USERNAME || DEFAULT_USERNAME,
      passwordHash: envPasswordHash,
      email: null,
      emailVerified: false,
      requirePasswordChange: false,
      anniversaryStart: null,
    }
  }

  const defaultPasswordHash = await hashPassword(DEFAULT_PASSWORD)
  return {
    username: DEFAULT_USERNAME,
    passwordHash: defaultPasswordHash,
    email: null,
    emailVerified: false,
    requirePasswordChange: false,
    anniversaryStart: null,
  }
}

export async function getSiteSettings(): Promise<SiteSettings> {
  return getCachedSiteSettings(fetchSiteSettingsFromDB)
}

async function initializeDefaultAdmin(): Promise<void> {
  try {
    const count = await prisma.siteSetting.count()
    if (count === 0) {
      const envPasswordHash = process.env.ADMIN_PASSWORD_HASH
      if (envPasswordHash) {
        await prisma.siteSetting.create({
          data: {
            username: process.env.ADMIN_USERNAME || DEFAULT_USERNAME,
            passwordHash: envPasswordHash,
            requirePasswordChange: false,
          },
        })
      } else {
        const defaultPasswordHash = await hashPassword(DEFAULT_PASSWORD)
        await prisma.siteSetting.create({
          data: {
            username: DEFAULT_USERNAME,
            passwordHash: defaultPasswordHash,
            requirePasswordChange: true,
          },
        })
      }
    }
  } catch (error) {
    console.error('[initializeDefaultAdmin] Failed:', error)
  }
}

export async function initializeCredentialsFromEnv(): Promise<void> {
  try {
    const count = await prisma.siteSetting.count()
    if (count === 0) {
      await initializeDefaultAdmin()
    }
  } catch (error) {
    console.error('[initializeCredentialsFromEnv] Failed:', error)
  }
}

export async function getCredentials(): Promise<{ username: string; passwordHash: string; requirePasswordChange: boolean }> {
  const settings = await getSiteSettings()
  return {
    username: settings.username,
    passwordHash: settings.passwordHash,
    requirePasswordChange: settings.requirePasswordChange,
  }
}

export async function updateCredentials(
  username: string,
  passwordHash: string,
  email?: string | null,
  clearRequireChange: boolean = false
): Promise<void> {
  try {
    const setting = await prisma.siteSetting.findFirst({
      orderBy: { id: 'asc' },
    })
    if (setting) {
      const now = new Date()
      const updateData: any = { username, passwordHash, updatedAt: now }
      if (clearRequireChange) {
        updateData.requirePasswordChange = false
      }
      if (email !== undefined) {
        updateData.email = email
        if (!email) {
          updateData.emailVerified = false
        }
      }
      await prisma.siteSetting.update({
        where: { id: setting.id },
        data: updateData,
      })
    } else {
      await prisma.siteSetting.create({
        data: {
          username,
          passwordHash,
          email: email || null,
          emailVerified: email ? true : false,
          requirePasswordChange: false,
        },
      })
    }
    invalidateSiteSettingsCache()
  } catch (error) {
    console.error('[updateCredentials] Failed:', error)
  }
}

export async function forceChangePassword(newPassword: string): Promise<boolean> {
  try {
    const setting = await prisma.siteSetting.findFirst({
      orderBy: { id: 'asc' },
    })
    if (!setting) return false

    const passwordHash = await hashPassword(newPassword)
    await prisma.siteSetting.update({
      where: { id: setting.id },
      data: {
        passwordHash,
        requirePasswordChange: false,
        updatedAt: new Date(),
      },
    })
    invalidateSiteSettingsCache()
    return true
  } catch {
    return false
  }
}

export async function isRequirePasswordChange(): Promise<boolean> {
  try {
    const setting = await prisma.siteSetting.findFirst({
      orderBy: { id: 'asc' },
    })
    return (setting as any)?.requirePasswordChange ?? false
  } catch {
    return false
  }
}

export async function updateEmail(email: string | null, verified?: boolean): Promise<void> {
  try {
    const setting = await prisma.siteSetting.findFirst({
      orderBy: { id: 'asc' },
    })
    if (setting) {
      const now = new Date()
      const updateData: any = {
        email: email || null,
        updatedAt: now,
      }
      if (verified !== undefined) {
        updateData.emailVerified = verified
      } else if (email) {
        updateData.emailVerified = false
      }
      await prisma.siteSetting.update({
        where: { id: setting.id },
        data: updateData,
      })
      invalidateSiteSettingsCache()
    }
  } catch {}
}

export async function setEmailVerified(): Promise<void> {
  try {
    const setting = await prisma.siteSetting.findFirst({
      orderBy: { id: 'asc' },
    })
    if (setting) {
      await prisma.siteSetting.update({
        where: { id: setting.id },
        data: { emailVerified: true },
      })
      invalidateSiteSettingsCache()
    }
  } catch {}
}

export async function generateResetToken(): Promise<{ token: string; exp: Date } | null> {
  try {
    const setting = await prisma.siteSetting.findFirst({
      orderBy: { id: 'asc' },
    })
    if (!setting || !setting.email || !setting.emailVerified) {
      return null
    }

    const token = crypto.randomUUID()
    const exp = new Date(Date.now() + 3600 * 1000)

    await prisma.siteSetting.update({
      where: { id: setting.id },
      data: { resetToken: token, resetTokenExp: exp },
    })

    return { token, exp }
  } catch {
    return null
  }
}

export async function verifyResetToken(token: string): Promise<boolean> {
  try {
    const setting = await prisma.siteSetting.findFirst({
      orderBy: { id: 'asc' },
    })
    if (!setting || !setting.resetToken || !setting.resetTokenExp) {
      return false
    }

    if (setting.resetToken !== token) {
      return false
    }

    if (setting.resetTokenExp < new Date()) {
      return false
    }

    return true
  } catch {
    return false
  }
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
  try {
    const setting = await prisma.siteSetting.findFirst({
      orderBy: { id: 'asc' },
    })
    if (!setting || !setting.resetToken || !setting.resetTokenExp) {
      return false
    }

    if (setting.resetToken !== token) {
      return false
    }

    if (setting.resetTokenExp < new Date()) {
      return false
    }

    const passwordHash = await hashPassword(newPassword)
    const now = new Date()

    await prisma.siteSetting.update({
      where: { id: setting.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExp: null,
        requirePasswordChange: false,
        updatedAt: now,
      },
    })

    invalidateSiteSettingsCache()
    return true
  } catch {
    return false
  }
}

export async function clearResetToken(): Promise<void> {
  try {
    const setting = await prisma.siteSetting.findFirst({
      orderBy: { id: 'asc' },
    })
    if (setting) {
      await prisma.siteSetting.update({
        where: { id: setting.id },
        data: {
          resetToken: null,
          resetTokenExp: null,
        },
      })
      invalidateSiteSettingsCache()
    }
  } catch {}
}

export async function updateAnniversaryStart(date: string | null): Promise<void> {
  try {
    const setting = await prisma.siteSetting.findFirst({
      orderBy: { id: 'asc' },
    })
    if (setting) {
      await prisma.siteSetting.update({
        where: { id: setting.id },
        data: {
          anniversaryStart: date,
          updatedAt: new Date(),
        },
      })
      invalidateSiteSettingsCache()
    }
  } catch (error) {
    console.error('[updateAnniversaryStart] Failed:', error)
  }
}
