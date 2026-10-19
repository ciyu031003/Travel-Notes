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
 *
 * 这是**引导性**写入（库里一个用户都没有），不是「改某个用户」，因此不存在写错人的风险。
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

/**
 * 读取站点设置（**只读兼容路径**，B11）。
 *
 * 为什么这里仍保留「首个用户（id 升序）」：
 *  · 登录页 / 初始化引导 / 未登录时的 needsSetup 判断没有 username 上下文，只需要「站点是否已配置」；
 *  · 历史数据是单管理员模型，首用户即站点主人。
 *
 * **写路径绝对不要走这里** —— 写完会隐式落到别的用户头上（评审 S-2/A-1 的账号接管链）。
 * 写凭据必须用 updateCredentials（按显式 username 定位）。
 */
async function fetchSiteSettingsFromDB(): Promise<SiteSettings> {
  try {
    await migrateSiteSettingToUser()

    // 只读兼容：首用户 = 站点级配置的归属者
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
    // 只读兼容：同上（初始化后重新读首用户）
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

/**
 * 引导初始化（B11）：**只在「一个用户都没有」时**按 env 创建初始管理员，已有用户时什么都不做。
 * 因此它不会隐式改写任何既有用户的凭据（旧语义的 7 处首用户写路径已全部移除）。
 */
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

/**
 * 写入账号凭据（B11：**按显式 username 定位**，不再 findFirst(id asc)）。
 *
 * 旧实现每次写都先取「id 最小的用户」，于是任何一次漏传目标都会改掉站长的账号/密码
 * （评审 S-2：注册即可接管站长）。现在：
 *  · 目标用户存在 → 按 id 更新，只影响这一个人；
 *  · 不存在 → 创建（仅初始化/引导路径会走到：/api/admin/setup、env 初始化）；
 *  · 绝不隐式改动其它用户。
 */
export async function updateCredentials(
  username: string,
  passwordHash: string,
  email?: string | null,
  clearRequireChange: boolean = false,
): Promise<void> {
  try {
    await migrateSiteSettingToUser()
    const user = await prisma.user.findUnique({ where: { username }, select: { id: true } })
    if (user) {
      const updateData: any = { passwordHash, updatedAt: new Date() }
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
