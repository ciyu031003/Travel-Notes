import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * B11：lib/auth.ts 的写路径必须按**显式 username** 定位，不能再 `findFirst(id asc)` 隐式改首用户。
 * 这条回归直接对应评审 S-2（注册新用户 → 改密端点 → 站长账号接管）的根因之一。
 */

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() },
    siteSetting: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))
vi.mock('@/lib/cache', () => ({
  getCachedSiteSettings: vi.fn(async (loader: () => Promise<unknown>) => loader()),
  invalidateSiteSettingsCache: vi.fn(),
}))
vi.mock('@/lib/auth-utils', () => ({
  hashPassword: vi.fn(async () => 'hashed'),
  verifyPassword: vi.fn(async () => true),
  signSession: vi.fn(async () => 'token'),
  verifySession: vi.fn(async () => null),
  getSessionPayload: vi.fn(() => null),
}))

import * as auth from '@/lib/auth'

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.user.count.mockResolvedValue(1)
  prismaMock.siteSetting.findFirst.mockResolvedValue(null)
  prismaMock.user.update.mockResolvedValue({ id: 7 })
  prismaMock.user.create.mockResolvedValue({ id: 8 })
})

describe('updateCredentials 按显式 username 定位', () => {
  it('只更新 username 对应用户的 id，不做 findFirst(id asc)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 7 })

    await auth.updateCredentials('alice', 'hash', null, true)

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { username: 'alice' },
      select: { id: true },
    })
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({ passwordHash: 'hash', requirePasswordChange: false }),
    })
  })

  it('目标用户不存在 → 创建该 username（仅初始化/引导路径），绝不 update 别人', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)

    await auth.updateCredentials('bootstrap-admin', 'hash')

    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ username: 'bootstrap-admin', passwordHash: 'hash' }),
    })
  })
})

describe('getSiteSettings 保留首用户只读兼容', () => {
  it('未传 username 时回退首用户（登录页/初始化引导需要）', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      username: 'admin',
      passwordHash: 'h',
      email: null,
      emailVerified: false,
      requirePasswordChange: false,
      anniversaryStart: null,
    })

    const settings = await auth.getSiteSettings()
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({ orderBy: { id: 'asc' } })
    expect(settings.username).toBe('admin')
    // 读路径不应该产生任何写
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })
})

describe('旧的无调用方函数已删除（防回流）', () => {
  it('updateEmail / setEmailVerified / updateAnniversaryStart / resetPasswordWithToken / forceChangePassword 均不存在', () => {
    const mod = auth as unknown as Record<string, unknown>
    expect(mod.updateEmail).toBeUndefined()
    expect(mod.setEmailVerified).toBeUndefined()
    expect(mod.updateAnniversaryStart).toBeUndefined()
    expect(mod.resetPasswordWithToken).toBeUndefined()
    expect(mod.forceChangePassword).toBeUndefined()
    expect(mod.generateResetToken).toBeUndefined()
  })
})
