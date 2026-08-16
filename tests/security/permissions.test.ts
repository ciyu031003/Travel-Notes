import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  requireSpaceMember,
  requireSpaceRole,
  requireSpaceOwner,
  canReadMemory,
  canEditMemory,
  canDeleteMedia,
  SpaceAccessError,
} from '@/lib/modules/space/permissions'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    spaceMember: { findUnique: vi.fn() },
    memory: { findUnique: vi.fn() },
    media: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requireSpaceMember（IDOR 防护核心）', () => {
  it('非成员被拒绝', async () => {
    prismaMock.spaceMember.findUnique.mockResolvedValue(null)
    await expect(requireSpaceMember('u1', 1)).rejects.toThrow(SpaceAccessError)
  })

  it('非 ACTIVE 状态被拒绝', async () => {
    prismaMock.spaceMember.findUnique.mockResolvedValue({ role: 'MEMBER', status: 'INVITED' })
    await expect(requireSpaceMember('u1', 1)).rejects.toThrow(SpaceAccessError)
  })

  it('OWNER 返回 isOwner=true', async () => {
    prismaMock.spaceMember.findUnique.mockResolvedValue({ role: 'OWNER', status: 'ACTIVE' })
    const access = await requireSpaceMember('u1', 1)
    expect(access.isOwner).toBe(true)
    expect(access.role).toBe('OWNER')
  })

  it('未知角色回退为 VIEWER', async () => {
    prismaMock.spaceMember.findUnique.mockResolvedValue({ role: 'SUPERUSER', status: 'ACTIVE' })
    const access = await requireSpaceMember('u1', 1)
    expect(access.role).toBe('VIEWER')
  })
})

describe('requireSpaceRole', () => {
  it('VIEWER 不能执行写操作', async () => {
    prismaMock.spaceMember.findUnique.mockResolvedValue({ role: 'VIEWER', status: 'ACTIVE' })
    await expect(requireSpaceRole('u1', 1, ['OWNER', 'MEMBER'])).rejects.toThrow(SpaceAccessError)
  })

  it('MEMBER 可以执行写操作', async () => {
    prismaMock.spaceMember.findUnique.mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE' })
    const access = await requireSpaceRole('u1', 1, ['OWNER', 'MEMBER'])
    expect(access.role).toBe('MEMBER')
  })
})

describe('requireSpaceOwner', () => {
  it('非 OWNER 被拒绝', async () => {
    prismaMock.spaceMember.findUnique.mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE' })
    await expect(requireSpaceOwner('u1', 1)).rejects.toThrow(SpaceAccessError)
  })
})

describe('canReadMemory', () => {
  it('PUBLIC 记忆任何人可读', async () => {
    prismaMock.memory.findUnique.mockResolvedValue({ spaceId: 1, visibility: 'PUBLIC', createdBy: 'other' })
    expect(await canReadMemory('u1', 1)).toBe(true)
  })

  it('创建者可读自己的 COUPLE 记忆', async () => {
    prismaMock.memory.findUnique.mockResolvedValue({ spaceId: 1, visibility: 'COUPLE', createdBy: 'u1' })
    expect(await canReadMemory('u1', 1)).toBe(true)
  })

  it('非成员不能读 COUPLE 记忆', async () => {
    prismaMock.memory.findUnique.mockResolvedValue({ spaceId: 1, visibility: 'COUPLE', createdBy: 'other' })
    prismaMock.spaceMember.findUnique.mockResolvedValue(null)
    expect(await canReadMemory('u1', 1)).toBe(false)
  })

  it('成员可读 COUPLE 记忆', async () => {
    prismaMock.memory.findUnique.mockResolvedValue({ spaceId: 1, visibility: 'COUPLE', createdBy: 'other' })
    prismaMock.spaceMember.findUnique.mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE' })
    expect(await canReadMemory('u1', 1)).toBe(true)
  })

  it('不存在的记忆不可读', async () => {
    prismaMock.memory.findUnique.mockResolvedValue(null)
    expect(await canReadMemory('u1', 999)).toBe(false)
  })
})

describe('canEditMemory', () => {
  it('创建者可编辑', async () => {
    prismaMock.memory.findUnique.mockResolvedValue({ spaceId: 1, createdBy: 'u1' })
    expect(await canEditMemory('u1', 1)).toBe(true)
  })

  it('同空间 MEMBER 可编辑他人记忆', async () => {
    prismaMock.memory.findUnique.mockResolvedValue({ spaceId: 1, createdBy: 'other' })
    prismaMock.spaceMember.findUnique.mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE' })
    expect(await canEditMemory('u1', 1)).toBe(true)
  })

  it('同空间 VIEWER 不可编辑', async () => {
    prismaMock.memory.findUnique.mockResolvedValue({ spaceId: 1, createdBy: 'other' })
    prismaMock.spaceMember.findUnique.mockResolvedValue({ role: 'VIEWER', status: 'ACTIVE' })
    expect(await canEditMemory('u1', 1)).toBe(false)
  })
})

describe('canDeleteMedia', () => {
  it('无 spaceId 的媒体不可删除', async () => {
    prismaMock.media.findUnique.mockResolvedValue({ spaceId: null })
    expect(await canDeleteMedia('u1', 1)).toBe(false)
  })

  it('非成员不可删除', async () => {
    prismaMock.media.findUnique.mockResolvedValue({ spaceId: 1 })
    prismaMock.spaceMember.findUnique.mockResolvedValue(null)
    expect(await canDeleteMedia('u1', 1)).toBe(false)
  })

  it('MEMBER 可删除', async () => {
    prismaMock.media.findUnique.mockResolvedValue({ spaceId: 1 })
    prismaMock.spaceMember.findUnique.mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE' })
    expect(await canDeleteMedia('u1', 1)).toBe(true)
  })
})
