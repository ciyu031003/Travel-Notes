import { prisma } from './db'
import { hashPassword, verifyPassword, signSession, verifySession, getSessionPayload } from './auth-utils'
import { getCachedSiteSettings, invalidateSiteSettingsCache } from './cache'

export { hashPassword, verifyPassword, signSession, verifySession, getSessionPayload }

const DEFAULT_USERNAME = 'admin'

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

/** 未配置任何凭据时的安全空设置：passwordHash 为空，登录将提示"系统尚未配置访问密码"。 */
function emptySettings(): SiteSettings {
  return {
    username: process.env.ADMIN_USERNAME || DEFAULT_USERNAME,
    passwordHash: '',
    email: null,
    emailVerified: false,
    requirePasswordChange: false,
    anniversaryStart: null,
  }
}

/**
 * 单管理员迁移：从旧 SiteSetting 回填到 User 表（幂等）。
 * 仅在 User 表为空且 SiteSetting 存在时执行，用于平滑升级。
 */
async function migrateSiteSettingToUser(): Promise<void> {
  try {
    const [userCount, legacy] = await Promise.all([
      prisma.user.count(),
      prisma.siteSetting.findFirst({ orderBy: { id: 'asc' } }),
    ])
    if (userCount > 0 || !legacy) return

    await prisma.user.create({
      data: {
        username: legacy.username,
        passwordHash: legacy.passwordHash,
        email: legacy.email,
        emailVerified: legacy.emailVerified,
        requirePasswordChange: (legacy as any).requirePasswordChange ?? false,
        anniversaryStart: (legacy as any).anniversaryStart ?? null,
      },
    })
  } catch (error) {
    console.error('[migrateSiteSettingToUser] Failed:', error)
  }
}

async function fetchSiteSettingsFromDB(): Promise<SiteSettings> {
  try {
    await migrateSiteSettingToUser()

    const user = await prisma.user.findFirst({ orderBy: { id: 'asc' } })
    if (user) {
      return mapSetting(user)
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
    return emptySettings()
  }

  await initializeDefaultAdmin()

  try {
    const user = await prisma.user.findFirst({ orderBy: { id: 'asc' } })
    if (user) {
      return mapSetting(user)
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

  return emptySettings()
}

export async function getSiteSettings(): Promise<SiteSettings> {
  return getCachedSiteSettings(fetchSiteSettingsFromDB)
}

async function initializeDefaultAdmin(): Promise<void> {
  // 安全策略：仅当显式配置了 ADMIN_PASSWORD_HASH 时才创建初始账号，
  // 绝不使用硬编码的默认密码。未配置时由 /admin/setup 引导完成初始化。
  const envPasswordHash = process.env.ADMIN_PASSWORD_HASH
  if (!envPasswordHash) return

  try {
    const count = await prisma.user.count()
    if (count === 0) {
      await prisma.user.create({
        data: {
          username: process.env.ADMIN_USERNAME || DEFAULT_USERNAME,
          passwordHash: envPasswordHash,
          requirePasswordChange: false,
        },
      })
    }
  } catch (error) {
    console.error('[initializeDefaultAdmin] Failed:', error)
  }
}

export async function initializeCredentialsFromEnv(): Promise<void> {
  try {
    await migrateSiteSettingToUser()
    const count = await prisma.user.count()
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
    await migrateSiteSettingToUser()
    const user = await prisma.user.findFirst({ orderBy: { id: 'asc' } })
    if (user) {
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
      await prisma.user.update({ where: { id: user.id }, data: updateData })
    } else {
      await prisma.user.create({
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
    await migrateSiteSettingToUser()
    const user = await prisma.user.findFirst({ orderBy: { id: 'asc' } })
    if (!user) return false

    const passwordHash = await hashPassword(newPassword)
    await prisma.user.update({
      where: { id: user.id },
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
    const user = await prisma.user.findFirst({ orderBy: { id: 'asc' } })
    return (user as any)?.requirePasswordChange ?? false
  } catch {
    return false
  }
}

export async function updateEmail(email: string | null, verified?: boolean): Promise<void> {
  try {
    await migrateSiteSettingToUser()
    const user = await prisma.user.findFirst({ orderBy: { id: 'asc' } })
    if (user) {
      const updateData: any = { email: email || null, updatedAt: new Date() }
      if (verified !== undefined) {
        updateData.emailVerified = verified
      } else if (email) {
        updateData.emailVerified = false
      }
      await prisma.user.update({ where: { id: user.id }, data: updateData })
      invalidateSiteSettingsCache()
    }
  } catch {}
}

export async function setEmailVerified(): Promise<void> {
  try {
    await migrateSiteSettingToUser()
    const user = await prisma.user.findFirst({ orderBy: { id: 'asc' } })
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })
      invalidateSiteSettingsCache()
    }
  } catch {}
}

// ===== 以下为旧 Token 密码重置流程（已被验证码流程替代，保留以兼容旧调用）=====

export async function generateResetToken(): Promise<{ token: string; exp: Date } | null> {
  try {
    const setting = await prisma.siteSetting.findFirst({ orderBy: { id: 'asc' } })
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
    const setting = await prisma.siteSetting.findFirst({ orderBy: { id: 'asc' } })
    if (!setting || !setting.resetToken || !setting.resetTokenExp) return false
    if (setting.resetToken !== token) return false
    if (setting.resetTokenExp < new Date()) return false
    return true
  } catch {
    return false
  }
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
  try {
    const setting = await prisma.siteSetting.findFirst({ orderBy: { id: 'asc' } })
    if (!setting || !setting.resetToken || !setting.resetTokenExp) return false
    if (setting.resetToken !== token) return false
    if (setting.resetTokenExp < new Date()) return false

    const passwordHash = await hashPassword(newPassword)
    const now = new Date()
    await prisma.siteSetting.update({
      where: { id: setting.id },
      data: { passwordHash, resetToken: null, resetTokenExp: null, requirePasswordChange: false, updatedAt: now },
    })
    invalidateSiteSettingsCache()
    return true
  } catch {
    return false
  }
}

export async function clearResetToken(): Promise<void> {
  try {
    const setting = await prisma.siteSetting.findFirst({ orderBy: { id: 'asc' } })
    if (setting) {
      await prisma.siteSetting.update({
        where: { id: setting.id },
        data: { resetToken: null, resetTokenExp: null },
      })
      invalidateSiteSettingsCache()
    }
  } catch {}
}

export async function updateAnniversaryStart(date: string | null): Promise<void> {
  try {
    await migrateSiteSettingToUser()
    const user = await prisma.user.findFirst({ orderBy: { id: 'asc' } })
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { anniversaryStart: date, updatedAt: new Date() },
      })
      invalidateSiteSettingsCache()
    }
  } catch (error) {
    console.error('[updateAnniversaryStart] Failed:', error)
  }
}
