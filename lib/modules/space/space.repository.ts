/**
 * Space 数据访问（Repository）
 */
import { prisma } from '../../db'
import type { SpaceRole } from './permissions'

/** 空间卡片上的成员头像堆叠预览 */
export interface SpaceMemberPreview {
  username: string
  nickname: string | null
  avatarUrl: string | null
  role: SpaceRole
}

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
  /** 头像堆叠预览（最多 5 位，按加入时间正序） */
  members?: SpaceMemberPreview[]
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
  /** 头像 / 昵称（从 User 关联带出，成员列表展示用；未注册或未设置时为 null） */
  nickname: string | null
  avatarUrl: string | null
}

/** 空间动态条目（复用 AuditLog，零改库） */
export interface SpaceActivityRecord {
  id: number
  username: string
  action: string
  resourceType: string | null
  resourceId: string | null
  metadata: string | null
  createdAt: string
}

export interface CreateSpaceInput {  name: string
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

function toMemberPreview(row: { username: string; role: string; user?: { nickname: string | null; avatarUrl: string | null } | null }): SpaceMemberPreview {
  return {
    username: row.username,
    nickname: row.user?.nickname ?? null,
    avatarUrl: row.user?.avatarUrl ?? null,
    role: toRole(row.role),
  }
}

export class PrismaSpaceRepository {
  async create(input: CreateSpaceInput): Promise<number> {
    /**
     * Owner 行的 `userId` 也必须写。
     *
     * 这是与 `addMember` 同源的第二个坑（由 `scripts/backfill-space-member-userid.cjs`
     * 的 dry-run 当场发现）：`spaceService.createSpace` 只传 `ownerUsername`，
     * 于是**创建者自己的成员行也是 userId=NULL** ——
     * 他虽然能在列表里看到空间（按 username 查），但一切按 userId 判定的能力
     * （`canActOnContent` / `canManageAlbum` / `myActiveSpaceIds`）都会对他失效。
     * 调用方没显式给 `ownerUserId` 时在这里按 username 兜底解析。
     */
    const ownerUserId =
      input.ownerUserId ??
      (await prisma.user
        .findUnique({ where: { username: input.ownerUsername }, select: { id: true } })
        .then((u) => u?.id ?? null)
        .catch(() => null))

    const space = await prisma.$transaction(async (tx) => {
      const created = await tx.space.create({
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description || null,
          // 类型：创建时显式指定，缺省 OTHER。
          // **不再沿用 schema 默认的 COUPLE** —— 原先创建入口不给这个字段，
          // 但那不是「落 COUPLE」而是被 service 层归一成了 OTHER，两处注释曾与会话
          // 不一致，方案 §1.2 D-3 已更正。唯一确定的是：都不是用户选的那个。
          spaceType: (input.spaceType as never) || ('OTHER' as never),
        },
      })
      await tx.spaceMember.create({
        data: {
          spaceId: created.id,
          username: input.ownerUsername,
          role: 'OWNER',
          status: 'ACTIVE',
          userId: ownerUserId,
        },
      })
      return created
    })
    return space.id
  }

  async findById(spaceId: number, myRole: SpaceRole = 'VIEWER'): Promise<SpaceRecord | null> {
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
        members: {
          where: { status: 'ACTIVE' },
          orderBy: { joinedAt: 'asc' },
          take: 5,
          include: { user: { select: { nickname: true, avatarUrl: true } } },
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
      myRole,
      members: space.members.map(toMemberPreview),
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
            members: {
              where: { status: 'ACTIVE' },
              orderBy: { joinedAt: 'asc' },
              take: 5,
              include: { user: { select: { nickname: true, avatarUrl: true } } },
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
      members: row.space.members.map(toMemberPreview),
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
      include: { user: { select: { nickname: true, avatarUrl: true } } },
    })
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      role: toRole(r.role),
      status: r.status,
      joinedAt: r.joinedAt.toISOString(),
      nickname: r.user?.nickname ?? null,
      avatarUrl: r.user?.avatarUrl ?? null,
    }))
  }

  /**
   * 加入 / 更新成员。
   *
   * **P0 修复**：原先这里不写 `userId`，而权限判定有「username」与「userId」两套键 —
   * `lib/modules/space/permissions.ts` 按 username，而 `lib/modules/access`、
   * `album.service.canManageAlbum`、`travel.service.myActiveSpaceIds`、
   * `getUserCapabilities` 全部按 userId。不写 userId 的后果是双向的：
   *   ① 用邀请码加入的成员在「userId 世界」里不存在 → 看不到也改不了空间内容；
   *   ② `getUserCapabilities` 用「查不到成员身份」反推「单用户 = OWNER」→ **成员越权**。
   */
  async addMember(spaceId: number, username: string, role: SpaceRole): Promise<void> {
    // 解析 userId：查不到（账号已删/大小写不一致）时写 null，仍保留 username 键可用。
    const user = await prisma.user
      .findUnique({ where: { username }, select: { id: true } })
      .catch(() => null)
    await prisma.spaceMember.upsert({
      where: { spaceId_username: { spaceId, username } },
      update: { role, status: 'ACTIVE', userId: user?.id ?? null },
      create: { spaceId, username, role, status: 'ACTIVE', userId: user?.id ?? null },
    })
  }

  /** 空间内活跃 OWNER 数量（「不允许把最后一个主人降级/移除」的判据） */
  async countActiveOwners(spaceId: number): Promise<number> {
    return prisma.spaceMember.count({ where: { spaceId, role: 'OWNER', status: 'ACTIVE' } })
  }

  /** 更新空间自身（改名 / 改简介 / 改类型 / 换封面），仅 OWNER 可达（在 service 层校验） */
  async update(
    spaceId: number,
    patch: {
      name?: string
      description?: string | null
      spaceType?: string
      coverMediaId?: number | null
    },
  ): Promise<void> {
    const data: Record<string, unknown> = {}
    if (patch.name !== undefined) data.name = patch.name
    if (patch.description !== undefined) data.description = patch.description
    if (patch.spaceType !== undefined) data.spaceType = patch.spaceType
    if (patch.coverMediaId !== undefined) data.coverMediaId = patch.coverMediaId
    if (Object.keys(data).length === 0) return
    await prisma.space.update({ where: { id: spaceId }, data: data as never })
  }

  /** 该空间下的资源统计（空间详情页统计条用） */
  async statsOf(spaceId: number): Promise<{
    albumCount: number
    travelCount: number
    memoryCount: number
    mediaCount: number
  }> {
    const [albumCount, travelCount, memoryCount, mediaCount] = await Promise.all([
      prisma.album.count({ where: { spaceId } }),
      prisma.travel.count({ where: { spaceId } }),
      prisma.memory.count({ where: { spaceId } }),
      prisma.media.count({ where: { spaceId } }),
    ])
    return { albumCount, travelCount, memoryCount, mediaCount }
  }

  /**
   * 空间动态（活动流）。
   *
   * 复用既有的 `AuditLog`（有 `spaceId` 与 `[spaceId, createdAt]` 索引）——
   * 零改库就能给「一起经营」提供可见痕迹。空间操作（创建/邀请/改权限/改设置）
   * 本来就在写审计日志；内容类操作补写即可（见各内容写路径）。
   */
  async listActivity(spaceId: number, limit = 30): Promise<SpaceActivityRecord[]> {
    const rows = await prisma.auditLog.findMany({
      where: { spaceId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    })
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      action: String(r.action),
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
    }))
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
