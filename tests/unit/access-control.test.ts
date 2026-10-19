import { describe, it, expect, vi, beforeEach } from 'vitest'

/** P3-39：统一访问控制矩阵（lib/modules/access/index.ts）此前无直接单测。 */
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    spaceMember: { findFirst: vi.fn() },
    travel: { findUnique: vi.fn() },
    album: { findUnique: vi.fn() },
    media: { findUnique: vi.fn() },
    memory: { findUnique: vi.fn() },
    moment: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

import {
  canViewResource,
  canActOnContent,
  fetchResourceSnapshot,
  canViewResourceById,
} from '@/lib/modules/access'

beforeEach(() => vi.clearAllMocks())

describe('canViewResource：PUBLIC / owner / SPACE 成员矩阵', () => {
  it('visibility=PUBLIC 或 isPublic=true → 任意登录用户可读（不查成员表）', async () => {
    await expect(canViewResource('Travel', { visibility: 'PUBLIC' }, 2)).resolves.toBe(true)
    await expect(canViewResource('Moment', { isPublic: true }, 3)).resolves.toBe(true)
    expect(prismaMock.spaceMember.findFirst).not.toHaveBeenCalled()
  })

  it('owner 命中（userId / ownerId / createdById）→ 可读', async () => {
    await expect(canViewResource('Media', { visibility: 'PRIVATE', userId: 2 }, 2)).resolves.toBe(true)
    await expect(canViewResource('Travel', { visibility: 'PRIVATE', ownerId: 2 }, 2)).resolves.toBe(true)
    await expect(canViewResource('Memory', { visibility: 'PRIVATE', createdById: 2 }, 2)).resolves.toBe(true)
    await expect(canViewResource('Travel', { visibility: 'PRIVATE', ownerId: 9 }, 2)).resolves.toBe(false)
  })

  it('未登录（userId 为空）不能读私有内容', async () => {
    await expect(canViewResource('Travel', { visibility: 'PRIVATE', ownerId: 2 }, null)).resolves.toBe(false)
    await expect(canViewResource('Travel', { visibility: 'PRIVATE' }, undefined)).resolves.toBe(false)
  })

  it('SPACE 可见性：空间 ACTIVE 成员可读，非成员不可读', async () => {
    prismaMock.spaceMember.findFirst.mockResolvedValue({ id: 1 })
    await expect(canViewResource('Album', { visibility: 'SPACE', spaceId: 5 }, 2)).resolves.toBe(true)
    prismaMock.spaceMember.findFirst.mockResolvedValue(null)
    await expect(canViewResource('Album', { visibility: 'SPACE', spaceId: 5 }, 2)).resolves.toBe(false)
    // 没有 spaceId 的 SPACE 资源 → 只有 owner 能读
    await expect(canViewResource('Album', { visibility: 'SPACE' }, 2)).resolves.toBe(false)
  })
})

describe('canActOnContent：owner 或空间 OWNER/MEMBER', () => {
  it('未登录 → false', async () => {
    await expect(canActOnContent('Travel', { ownerId: 2 }, null)).resolves.toBe(false)
  })

  it('owner → true；空间成员（OWNER/MEMBER）→ true；否则 false', async () => {
    await expect(canActOnContent('Travel', { ownerId: 2 }, 2)).resolves.toBe(true)

    prismaMock.spaceMember.findFirst.mockResolvedValue({ id: 1 })
    await expect(canActOnContent('Travel', { ownerId: 9, spaceId: 5 }, 2)).resolves.toBe(true)
    const where = prismaMock.spaceMember.findFirst.mock.calls[0][0].where
    expect(where.role).toEqual({ in: ['OWNER', 'MEMBER'] })

    prismaMock.spaceMember.findFirst.mockResolvedValue(null)
    await expect(canActOnContent('Travel', { ownerId: 9, spaceId: 5 }, 2)).resolves.toBe(false)
    await expect(canActOnContent('Travel', { ownerId: 9, spaceId: null }, 2)).resolves.toBe(false)
  })
})

describe('fetchResourceSnapshot：按资源类型查对应字段', () => {
  it('Travel/Album/Media/Memory/Moment 各自映射；未知类型 null', async () => {
    prismaMock.travel.findUnique.mockResolvedValue({ visibility: 'SPACE', isPublic: false, ownerId: 1, spaceId: 2 })
    expect(await fetchResourceSnapshot('Travel', 1)).toMatchObject({ ownerId: 1, spaceId: 2 })

    prismaMock.album.findUnique.mockResolvedValue({ visibility: 'PRIVATE', isPublic: false, userId: 1, spaceId: null })
    expect(await fetchResourceSnapshot('Album', 1)).toMatchObject({ userId: 1 })

    prismaMock.media.findUnique.mockResolvedValue({ visibility: 'PUBLIC', isPublic: true, userId: 1, spaceId: null })
    expect(await fetchResourceSnapshot('Media', 1)).toMatchObject({ isPublic: true })

    prismaMock.memory.findUnique.mockResolvedValue({ visibility: 'SPACE', createdById: 1, spaceId: 2 })
    expect(await fetchResourceSnapshot('Memory', 1)).toMatchObject({ createdById: 1 })

    prismaMock.moment.findUnique.mockResolvedValue({ isPublic: true, userId: 1 })
    expect(await fetchResourceSnapshot('Moment', 1)).toMatchObject({ userId: 1 })

    expect(await fetchResourceSnapshot('Nope' as never, 1)).toBeNull()
  })

  it('canViewResourceById：快照不存在 false；存在则复用矩阵判定', async () => {
    prismaMock.moment.findUnique.mockResolvedValue(null)
    await expect(canViewResourceById('Moment', 1, 2)).resolves.toBe(false)

    prismaMock.moment.findUnique.mockResolvedValue({ isPublic: true, userId: 9 })
    await expect(canViewResourceById('Moment', 1, 2)).resolves.toBe(true)

    prismaMock.moment.findUnique.mockResolvedValue({ isPublic: false, userId: 9 })
    await expect(canViewResourceById('Moment', 1, 2)).resolves.toBe(false)
  })
})
