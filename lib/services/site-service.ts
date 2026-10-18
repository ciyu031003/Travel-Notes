import { revalidatePath } from 'next/cache'
import { prisma } from '../db'
import { CacheService } from '../infrastructure/cache'
import { verifyPassword, hashPassword } from '../auth-utils'
import { invalidateCurrentUserCache } from '../current-user'

export interface SiteConfigDTO {
  username: string
  email: string | null
  emailVerified: boolean
  requirePasswordChange: boolean
  anniversaryStart: string | null
}

/**
 * 读路径：按用户名定位用户；未传时回退首个用户（单管理员时代的兼容语义）。
 * **只允许 getSiteConfig 等读路径使用** —— 写路径必须用 findUserByUsernameStrict。
 */
async function findUserByUsername(username?: string | null) {
  if (username) {
    const user = await prisma.user.findUnique({ where: { username } })
    if (user) return user
  }
  // 兼容旧调用：未传用户名时回退首个用户（仅读：站点配置展示）
  return prisma.user.findFirst({ orderBy: { id: 'asc' } })
}

/**
 * 写路径（P0-3）：严格按用户名定位，**绝不回退首个用户**。
 *
 * 为什么：旧实现里任何一次漏传 username 都会静默写到 id 最小的用户（站长）身上 ——
 * 评审 A-1/S-2 的账号接管链正是这一类「隐式首用户」语义堆出来的。
 * 现在未传用户名直接返回 null，由调用方返回失败。
 */
async function findUserByUsernameStrict(username?: string | null) {
  if (!username) return null
  return prisma.user.findUnique({ where: { username } })
}

const MISSING_USER = { success: false as const, error: '缺少用户标识，请重新登录' }
const USER_NOT_FOUND = { success: false as const, error: '用户不存在' }

export class SiteService {
  private readonly CACHE_TTL = 600

  constructor(
    private readonly cache: CacheService,
  ) {}

  /** 读路径：站点/账号配置（可按用户名取；不传时兼容取首个用户） */
  async getSiteConfig(username?: string | null): Promise<SiteConfigDTO> {
    const cacheKey = `site:config:${username || 'first'}`
    const cached = await this.cache.get<SiteConfigDTO>(cacheKey)
    if (cached) return cached

    const user = await findUserByUsername(username)
    const dto = {
      username: user?.username || '',
      email: user?.email ?? null,
      emailVerified: user?.emailVerified ?? false,
      requirePasswordChange: user?.requirePasswordChange ?? false,
      anniversaryStart: user?.anniversaryStart ?? null,
    }
    await this.cache.set(cacheKey, dto, this.CACHE_TTL, ['site'])
    return dto
  }

  /** 写路径：纪念日起点（作用于本人） */
  async updateAnniversaryStart(
    date: string | null,
    username?: string | null,
  ): Promise<{ success: boolean; error?: string }> {
    const user = await findUserByUsernameStrict(username)
    if (!username) return MISSING_USER
    if (!user) return USER_NOT_FOUND

    await prisma.user.update({ where: { id: user.id }, data: { anniversaryStart: date } })
    await this.cache.deleteByTag('site')
    try {
      revalidatePath('/')
      revalidatePath('/travel')
      revalidatePath('/album')
    } catch {
      // 构建期或无权调用时忽略
    }
    return { success: true }
  }

  /** 写路径：改用户名（作用于本人，需当前密码） */
  async updateUsername(
    username: string,
    currentPassword: string,
    currentUsername?: string | null,
  ): Promise<{ success: boolean; error?: string }> {
    if (!currentUsername) return MISSING_USER
    const user = await findUserByUsernameStrict(currentUsername)
    if (!user || !user.passwordHash) return USER_NOT_FOUND
    const valid = await verifyPassword(currentPassword, user.passwordHash)
    if (!valid) return { success: false, error: '当前密码错误' }

    const exists = await prisma.user.findUnique({ where: { username } })
    if (exists && exists.id !== user.id) return { success: false, error: '该用户名已被占用' }

    await prisma.user.update({ where: { id: user.id }, data: { username } })
    invalidateCurrentUserCache(user.id)
    await this.cache.deleteByTag('site')
    return { success: true }
  }

  /** 写路径：改密码（作用于本人，需当前密码） */
  async updatePassword(
    currentPassword: string,
    newPassword: string,
    currentUsername?: string | null,
  ): Promise<{ success: boolean; error?: string }> {
    if (!currentUsername) return MISSING_USER
    const user = await findUserByUsernameStrict(currentUsername)
    if (!user || !user.passwordHash) return USER_NOT_FOUND
    const valid = await verifyPassword(currentPassword, user.passwordHash)
    if (!valid) return { success: false, error: '当前密码错误' }

    const newHash = await hashPassword(newPassword)
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } })
    await this.cache.deleteByTag('site')
    return { success: true }
  }

  /** 写路径：改邮箱（作用于本人；绑定验证码场景可跳过旧密码校验） */
  async updateEmail(
    email: string | null,
    currentPassword?: string,
    skipPasswordCheck?: boolean,
    currentUsername?: string | null,
  ): Promise<{ success: boolean; error?: string }> {
    if (!currentUsername) return MISSING_USER
    const user = await findUserByUsernameStrict(currentUsername)
    if (!user) return USER_NOT_FOUND
    if (!skipPasswordCheck && currentPassword) {
      const valid = await verifyPassword(currentPassword, user.passwordHash || '')
      if (!valid) return { success: false, error: '当前密码错误' }
    }
    await prisma.user.update({ where: { id: user.id }, data: { email: email || null } })
    invalidateCurrentUserCache(user.id)
    await this.cache.deleteByTag('site')
    return { success: true }
  }

  /** 写路径前的密码确认（作用于本人） */
  async verifyPassword(password: string, username?: string | null): Promise<{ success: boolean; error?: string }> {
    if (!username) return MISSING_USER
    const user = await findUserByUsernameStrict(username)
    if (!user || !user.passwordHash) return USER_NOT_FOUND
    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) return { success: false, error: '当前密码错误' }
    return { success: true }
  }
}
