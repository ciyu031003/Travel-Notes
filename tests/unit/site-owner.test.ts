import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findFirst: vi.fn(), updateMany: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

import {
  ensureSiteOwnerRole,
  getSiteOwnerId,
  isSiteOwner,
  invalidateSiteOwnerCache,
} from '@/lib/site-owner'

beforeEach(() => {
  vi.clearAllMocks()
  invalidateSiteOwnerCache()
})

describe('ensureSiteOwnerRole（P0-3 站点主人显式化）', () => {
  it('无 SITE_OWNER 时提升 id 最小的用户，且只提升一次', async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce(null) // 查现有主人：没有
      .mockResolvedValueOnce({ id: 1 }) // 取最小 id 用户
      .mockResolvedValueOnce({ id: 1 }) // 提升后重新确认
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 })

    await expect(ensureSiteOwnerRole()).resolves.toBe(1)
    expect(prismaMock.user.updateMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.user.updateMany.mock.calls[0][0].where).toMatchObject({
      id: 1,
      siteRole: { not: 'SITE_OWNER' },
    })
    expect(prismaMock.user.updateMany.mock.calls[0][0].data).toEqual({ siteRole: 'SITE_OWNER' })

    // 第二次调用：已存在主人 → 不再 updateMany（幂等，不重复改别人）
    prismaMock.user.findFirst.mockReset()
    prismaMock.user.findFirst.mockResolvedValue({ id: 1 })
    await expect(ensureSiteOwnerRole()).resolves.toBe(1)
    expect(prismaMock.user.updateMany).toHaveBeenCalledTimes(1)
  })

  it('空库（没有用户）→ null，不写库', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null)
    await expect(ensureSiteOwnerRole()).resolves.toBeNull()
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })

  it('数据库异常 → null 且不抛（fail-closed 到普通用户）', async () => {
    prismaMock.user.findFirst.mockRejectedValue(new Error('db down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(ensureSiteOwnerRole()).resolves.toBeNull()
    spy.mockRestore()
  })
})

describe('getSiteOwnerId 缓存', () => {
  it('60s 内复用缓存，不重复查库', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 7 })
    await expect(getSiteOwnerId()).resolves.toBe(7)
    await expect(getSiteOwnerId()).resolves.toBe(7)
    expect(prismaMock.user.findFirst).toHaveBeenCalledTimes(1)
  })

  it('失效缓存后重新查库', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 7 })
    await getSiteOwnerId()
    invalidateSiteOwnerCache()
    await getSiteOwnerId()
    expect(prismaMock.user.findFirst).toHaveBeenCalledTimes(2)
  })

  it('DB 异常 → null（不抛）', async () => {
    prismaMock.user.findFirst.mockRejectedValue(new Error('db down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getSiteOwnerId()).resolves.toBeNull()
    spy.mockRestore()
  })
})

describe('isSiteOwner', () => {
  it('只有站点主人本人为 true', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 7 })
    await expect(isSiteOwner(7)).resolves.toBe(true)
    await expect(isSiteOwner(8)).resolves.toBe(false)
    await expect(isSiteOwner(null)).resolves.toBe(false)
    await expect(isSiteOwner(undefined)).resolves.toBe(false)
  })

  it('无主人（空库）时所有用户都不是主人', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null)
    await expect(isSiteOwner(1)).resolves.toBe(false)
  })
})
