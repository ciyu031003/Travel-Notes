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

/** 按用户名定位用户（多用户：设置类操作只作用于当前登录用户） */
async function findUserByUsername(username?: string | null) {
  if (username) {
    const user = await prisma.user.findUnique({ where: { username } })
    if (user) return user
  }
  // 兼容旧调用：未传用户名时回退首个用户
  return prisma.user.findFirst({ orderBy: { id: 'asc' } })
}

export class SiteService {
  private readonly CACHE_TTL = 600

  constructor(
    private readonly cache: CacheService,
  ) {}

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

  async updateAnniversaryStart(date: string | null, username?: string | null): Promise<void> {
    const user = await findUserByUsername(username)
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { anniversaryStart: date } })
    }
    await this.cache.deleteByTag('site')
    try {
      revalidatePath('/')
      revalidatePath('/travel')
      revalidatePath('/album')
    } catch {
      // 构建期或无权调用时忽略
    }
  }

  async updateUsername(username: string, currentPassword: string, currentUsername?: string | null): Promise<{ success: boolean; error?: string }> {
    const user = await findUserByUsername(currentUsername)
    if (!user || !user.passwordHash) return { success: false, error: '用户不存在' }
    const valid = await verifyPassword(currentPassword, user.passwordHash)
    if (!valid) return { success: false, error: '当前密码错误' }

    const exists = await prisma.user.findUnique({ where: { username } })
    if (exists && exists.id !== user.id) return { success: false, error: '该用户名已被占用' }

    await prisma.user.update({ where: { id: user.id }, data: { username } })
    invalidateCurrentUserCache(user.id)
    await this.cache.deleteByTag('site')
    return { success: true }
  }

  async updatePassword(currentPassword: string, newPassword: string, currentUsername?: string | null): Promise<{ success: boolean; error?: string }> {
    const user = await findUserByUsername(currentUsername)
    if (!user || !user.passwordHash) return { success: false, error: '用户不存在' }
    const valid = await verifyPassword(currentPassword, user.passwordHash)
    if (!valid) return { success: false, error: '当前密码错误' }

    const newHash = await hashPassword(newPassword)
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } })
    await this.cache.deleteByTag('site')
    return { success: true }
  }

  async updateEmail(email: string | null, currentPassword?: string, skipPasswordCheck?: boolean, currentUsername?: string | null): Promise<{ success: boolean; error?: string }> {
    const user = await findUserByUsername(currentUsername)
    if (!user) return { success: false, error: '用户不存在' }
    if (!skipPasswordCheck && currentPassword) {
      const valid = await verifyPassword(currentPassword, user.passwordHash || '')
      if (!valid) return { success: false, error: '当前密码错误' }
    }
    await prisma.user.update({ where: { id: user.id }, data: { email: email || null } })
    invalidateCurrentUserCache(user.id)
    await this.cache.deleteByTag('site')
    return { success: true }
  }

  async verifyPassword(password: string, username?: string | null): Promise<{ success: boolean; error?: string }> {
    const user = await findUserByUsername(username)
    if (!user || !user.passwordHash) return { success: false, error: '用户不存在' }
    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) return { success: false, error: '当前密码错误' }
    return { success: true }
  }
}
