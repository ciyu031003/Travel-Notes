/**
 * Space 数据访问（Repository）
 */
import { prisma } from '../../db'
import type { SpaceRole } from './permissions'

export interface SpaceRecord {
  id: number
  name: string
  slug: string
  description: string | null
  coverMediaId: number | null
  /** 空间类型（情侣/家人/朋友/个人/其他）—— 创建时可指定 */
  spaceType: string
  createdAt: string
  updatedAt: string
  memberCount: number
  myRole: SpaceRole
  /** 空间内共享内容统计（伴侣共同查看的相册/旅行/回忆/照片） */
  albumCount?: number
  travelCount?: number
  memoryCount?: number
  mediaCount?: number
}

export interface SpaceInviteRecord {
  id: number
  spaceId: number
  role: SpaceRole
  /** 明文邀请码（仅空间创建者可见） */
  code: string
  expiresAt: string
  createdBy: string
  usedAt: string | null
  createdAt: string
  status: 'PENDING' | 'USED' | 'EXPIRED'
}

export interface SpaceMemberRecord {
  id: number
  username: string
  role: SpaceRole
  status: string
  joinedAt: string
}

export interface CreateSpaceInput {
  name: string
  slug: string
  description?: string
  /** 空间类型；缺省 OTHER（避免一律落 COUPLE） */
  spaceType?: string
  ownerUsername: string
  /** 空间 OWNER 的 userId（可选；个人空间自动创建时带上，便于按 userId 查询） */
  ownerUserId?: number | null
}

function toInviteStatus(invite: { usedAt: Date | null; expiresAt: Date }): SpaceInviteRecord['status'] {
  if (invite.usedAt) return 'USED'
  if (invite.expiresAt.getTime() < Date.now()) return 'EXPIRED'
  return 'PENDING'
}

function toRole(role: string): SpaceRole {
  if (role === 'OWNER' || role === 'MEMBER' || role === 'VIEWER') return role
  return 'VIEWER'
}

export class PrismaSpaceRepository {
  async create(input: CreateSpaceInput): Promise<number> {
    const space = await prisma.$transaction(async (tx) => {
      const created = await tx.space.create({
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description || null,
          // 类型：创建时显式指定，缺省 OTHER。
          // **不再沿用 schema 默认的 COUPLE** —— 原先创建入口不给这个字段，
          // 于是"家人空间 / 闺蜜空间"根本建不出来，界面上全是情侣空间。
          spaceType: (input.spaceType as never) || ('OTHER' as never),
        },
      })
      await tx.spaceMember.create({
        data: {
          spaceId: created.id,
          username: input.ownerUsername,
          role: 'OWNER',
          status: 'ACTIVE',
          userId: input.ownerUserId ?? null,
        },
      })
      return created
    })
    return space.id
  }

  async findById(spaceId: number): Promise<SpaceRecord | null> {
    const space = await prisma.space.findUnique({
      where: { id: spaceId },
      include: {
        _count: {
          select: {
            members: { where: { status: 'ACTIVE' } },
            travels: true,
            albums: true,
            memories: true,
            media: true,
          },
        },
      },
    })
    if (!space) return null
    return {
      id: space.id,
      name: space.name,
      slug: space.slug,
      description: space.description,
      coverMediaId: space.coverMediaId,
      spaceType: String(space.spaceType),
      createdAt: space.createdAt.toISOString(),
      updatedAt: space.updatedAt.toISOString(),
      memberCount: space._count.members,
      myRole: 'VIEWER',
      albumCount: space._count.albums,
      travelCount: space._count.travels,
      memoryCount: space._count.memories,
      mediaCount: space._count.media,
    }
  }

  async findBySlug(slug: string): Promise<SpaceRecord | null> {
    const space = await prisma.space.findUnique({ where: { slug } })
    if (!space) return null
    return {
      id: space.id,
      name: space.name,
      slug: space.slug,
      description: space.description,
      coverMediaId: space.coverMediaId,
      spaceType: String(space.spaceType),
      createdAt: space.createdAt.toISOString(),
      updatedAt: space.updatedAt.toISOString(),
      memberCount: 0,
      myRole: 'VIEWER',
    }
  }

  async listForUser(username: string): Promise<Array<SpaceRecord & { myRole: SpaceRole }>> {
    const rows = await prisma.spaceMember.findMany({
      where: { username, status: 'ACTIVE' },
      orderBy: { joinedAt: 'desc' },
      include: {
        space: {
          include: {
            _count: {
              select: {
                members: { where: { status: 'ACTIVE' } },
                travels: true,
                albums: true,
                memories: true,
                media: true,
              },
            },
          },
        },
      },
    })
    return rows.map((row) => ({
      id: row.space.id,
      name: row.space.name,
      slug: row.space.slug,
      description: row.space.description,
      coverMediaId: row.space.coverMediaId,
      spaceType: String(row.space.spaceType),
      createdAt: row.space.createdAt.toISOString(),
      updatedAt: row.space.updatedAt.toISOString(),
      memberCount: row.space._count.members,
      myRole: toRole(row.role),
      albumCount: row.space._count.albums,
      travelCount: row.space._count.travels,
      memoryCount: row.space._count.memories,
      mediaCount: row.space._count.media,
    }))
  }

  async listMembers(spaceId: number): Promise<SpaceMemberRecord[]> {
    const rows = await prisma.spaceMember.findMany({
      where: { spaceId },
      orderBy: { joinedAt: 'asc' },
    })
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      role: toRole(r.role),
      status: r.status,
      joinedAt: r.joinedAt.toISOString(),
    }))
  }

  async addMember(spaceId: number, username: string, role: SpaceRole): Promise<void> {
    await prisma.spaceMember.upsert({
      where: { spaceId_username: { spaceId, username } },
      update: { role, status: 'ACTIVE' },
      create: { spaceId, username, role, status: 'ACTIVE' },
    })
  }

  async removeMember(spaceId: number, username: string): Promise<void> {
    await prisma.spaceMember.updateMany({
      where: { spaceId, username },
      data: { status: 'REMOVED' },
    })
  }

  async delete(spaceId: number): Promise<void> {
    await prisma.space.delete({ where: { id: spaceId } })
  }

  async slugExists(slug: string): Promise<boolean> {
    const row = await prisma.space.findUnique({ where: { slug }, select: { id: true } })
    return row !== null
  }

  // ===== 邀请伴侣 =====

  async createInvite(input: {
    spaceId: number
    role: SpaceRole
    expiresAt: Date
    createdBy: string
    tokenHash: string
    code: string
  }): Promise<number> {
    const row = await prisma.spaceInvite.create({
      data: {
        spaceId: input.spaceId,
        role: input.role,
        expiresAt: input.expiresAt,
        createdBy: input.createdBy,
        tokenHash: input.tokenHash,
        code: input.code,
      },
    })
    return row.id
  }

  async findInviteByHash(tokenHash: string) {
    return prisma.spaceInvite.findUnique({
      where: { tokenHash },
      include: { space: { select: { id: true, name: true, slug: true } } },
    })
  }

  async listInvites(spaceId: number): Promise<SpaceInviteRecord[]> {
    const rows = await prisma.spaceInvite.findMany({
      where: { spaceId },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((r) => ({
      id: r.id,
      spaceId: r.spaceId,
      role: toRole(r.role),
      code: r.code,
      expiresAt: r.expiresAt.toISOString(),
      createdBy: r.createdBy,
      usedAt: r.usedAt ? r.usedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      status: toInviteStatus(r),
    }))
  }

  async revokeInvite(inviteId: number): Promise<void> {
    await prisma.spaceInvite.delete({ where: { id: inviteId } })
  }

  async markInviteUsed(inviteId: number): Promise<void> {
    await prisma.spaceInvite.update({
      where: { id: inviteId },
      data: { usedAt: new Date() },
    })
  }
}

export const prismaSpaceRepository = new PrismaSpaceRepository()
