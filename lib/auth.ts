import { prisma } from './db'
import { hashPassword, verifyPassword, signSession, verifySession, getSessionPayload } from './auth-utils'

export { hashPassword, verifyPassword, signSession, verifySession, getSessionPayload }

export interface SiteSettings {
  username: string
  passwordHash: string
  email: string | null
  emailVerified: boolean
}

export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const setting = await prisma.siteSetting.findFirst({
      orderBy: { id: 'asc' },
    })
    if (setting) {
      return {
        username: setting.username,
        passwordHash: setting.passwordHash,
        email: setting.email,
        emailVerified: setting.emailVerified,
      }
    }
  } catch {}

  const envUsername = process.env.ADMIN_USERNAME || 'admin'
  const envPasswordHash = process.env.ADMIN_PASSWORD_HASH
  return {
    username: envUsername,
    passwordHash: envPasswordHash || '',
    email: null,
    emailVerified: false,
  }
}

export async function getCredentials(): Promise<{ username: string; passwordHash: string }> {
  const settings = await getSiteSettings()
  return { username: settings.username, passwordHash: settings.passwordHash }
}

export async function initializeCredentialsFromEnv(): Promise<void> {
  try {
    const count = await prisma.siteSetting.count()
    if (count === 0) {
      const envUsername = process.env.ADMIN_USERNAME || 'admin'
      const envPasswordHash = process.env.ADMIN_PASSWORD_HASH
      if (envPasswordHash) {
        await prisma.siteSetting.create({
          data: {
            username: envUsername,
            passwordHash: envPasswordHash,
          },
        })
      }
    }
  } catch {}
}

export async function updateCredentials(
  username: string,
  passwordHash: string,
  email?: string | null
): Promise<void> {
  try {
    const setting = await prisma.siteSetting.findFirst({
      orderBy: { id: 'asc' },
    })
    if (setting) {
      const now = new Date()
      const updateData: any = { username, passwordHash, updatedAt: now }
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
        },
      })
    }
  } catch {}
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
        updatedAt: now,
      },
    })

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
    }
  } catch {}
}
