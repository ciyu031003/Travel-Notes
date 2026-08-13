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
  createdAt: string
  updatedAt: string
  memberCount: number
  myRole: SpaceRole
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
  ownerUsername: string
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
        },
      })
      await tx.spaceMember.create({
        data: {
          spaceId: created.id,
          username: input.ownerUsername,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      })
      return created
    })
    return space.id
  }

  async findById(spaceId: number): Promise<SpaceRecord | null> {
    const space = await prisma.space.findUnique({
      where: { id: spaceId },
      include: { _count: { select: { members: { where: { status: 'ACTIVE' } } } } },
    })
    if (!space) return null
    return {
      id: space.id,
      name: space.name,
      slug: space.slug,
      description: space.description,
      coverMediaId: space.coverMediaId,
      createdAt: space.createdAt.toISOString(),
      updatedAt: space.updatedAt.toISOString(),
      memberCount: space._count.members,
      myRole: 'VIEWER',
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
          include: { _count: { select: { members: { where: { status: 'ACTIVE' } } } } },
        },
      },
    })
    return rows.map((row) => ({
      id: row.space.id,
      name: row.space.name,
      slug: row.space.slug,
      description: row.space.description,
      coverMediaId: row.space.coverMediaId,
      createdAt: row.space.createdAt.toISOString(),
      updatedAt: row.space.updatedAt.toISOString(),
      memberCount: row.space._count.members,
      myRole: toRole(row.role),
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
}

export const prismaSpaceRepository = new PrismaSpaceRepository()
