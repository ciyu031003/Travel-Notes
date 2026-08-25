/**
 * v3.1 M2-B1：统一访问控制中间层（canViewResource / canActOnResource）。
 *
 * 目标：把分散的「visibility + isPublic + Space 成员 + 社交公开」判读收敛为单一入口，
 * 杜绝「知道 ID 就能读私人数据」的 IDOR，并为权限测试矩阵提供唯一实现。
 *
 * 资源×可见性矩阵（本模块即矩阵的实现）：
 *
 * | 资源         | PRIVATE        | SPACE（空间）   | PUBLIC（社交公开）      |
 * |-------------|----------------|------------------|------------------------|
 * | Travel      | 仅 owner       | 空间 ACTIVE 成员 | 所有登录用户（isPublishedToCircle） |
 * | Album       | 仅 owner       | 空间 ACTIVE 成员 | 所有登录用户            |
 * | Media       | 仅 owner       | 空间 ACTIVE 成员 | 所有登录用户            |
 * | Memory      | 仅 owner       | 空间 ACTIVE 成员 | 所有登录用户            |
 * | Moment      | 仅 owner       | 空间 ACTIVE 成员 | 所有登录用户            |
 *
 * 读取规则（canViewResource）：
 * 1) PUBLIC / isPublic=true → 任意登录用户可读
 * 2) PRIVATE → 仅 owner（userId/ownerId/createdById 命中）
 * 3) SPACE → owner 或 空间（spaceId）ACTIVE 成员
 */
import { prisma } from '@/lib/db'

export type ResourceKind = 'Travel' | 'Album' | 'Media' | 'Memory' | 'Moment'

/** 资源可见性快照（各资源子集，统一判读） */
interface VisibilitySnapshot {
  visibility?: string | null
  isPublic?: boolean | null
  userId?: number | null
  ownerId?: number | null
  createdById?: number | null
  spaceId?: number | null
}

function isPubliclyVisible(s: VisibilitySnapshot): boolean {
  return s.visibility === 'PUBLIC' || s.isPublic === true
}

function isOwner(s: VisibilitySnapshot, userId: number | null | undefined): boolean {
  if (!userId) return false
  return s.userId === userId || s.ownerId === userId || s.createdById === userId
}

async function isSpaceActiveMember(spaceId: number | null | undefined, userId: number | null | undefined): Promise<boolean> {
  if (!spaceId || !userId) return false
  const member = await prisma.spaceMember.findFirst({
    where: { spaceId, userId, status: 'ACTIVE' },
    select: { id: true },
  })
  return !!member
}

/**
 * 统一读权限判读：资源快照 → 是否可读。
 * 用法：先查资源（含 visibility/isPublic/owner/space 字段），再调本函数。
 * 与既有 social-permissions.canReadTravel/canReadMedia 等价，收敛于此；新代码统一走这里。
 */
export async function canViewResource(
  resource: ResourceKind,
  snapshot: VisibilitySnapshot,
  userId: number | null | undefined,
): Promise<boolean> {
  if (isPubliclyVisible(snapshot)) return true
  if (isOwner(snapshot, userId)) return true
  if (snapshot.visibility === 'SPACE') {
    return isSpaceActiveMember(snapshot.spaceId, userId)
  }
  return false
}

/**
 * 统一写权限判读（内容类资源）：OWNER 或空间 OWNER/MEMBER 可写。
 * VIEWER 及外部用户返回 false（服务端在 canViewResource 之后叠加角色校验）。
 */
export async function canActOnContent(
  resource: ResourceKind,
  snapshot: VisibilitySnapshot,
  userId: number | null | undefined,
): Promise<boolean> {
  if (!userId) return false
  if (isOwner(snapshot, userId)) return true
  if (snapshot.spaceId) {
    const member = await prisma.spaceMember.findFirst({
      where: { spaceId: snapshot.spaceId, userId, status: 'ACTIVE', role: { in: ['OWNER', 'MEMBER'] } },
      select: { id: true },
    })
    return !!member
  }
  return false
}

/** 便捷：由资源主键查快照（按 kind 映射查询字段；未命中返回 null） */
export async function fetchResourceSnapshot(kind: ResourceKind, id: number): Promise<VisibilitySnapshot | null> {
  switch (kind) {
    case 'Travel': {
      const t = await prisma.travel.findUnique({
        where: { id },
        select: { visibility: true, isPublic: true, ownerId: true, spaceId: true },
      })
      return t
    }
    case 'Album': {
      const a = await prisma.album.findUnique({
        where: { id },
        select: { visibility: true, isPublic: true, userId: true, spaceId: true },
      })
      return a
    }
    case 'Media': {
      const m = await prisma.media.findUnique({
        where: { id },
        select: { visibility: true, isPublic: true, userId: true, spaceId: true },
      })
      return m
    }
    case 'Memory': {
      const m = await prisma.memory.findUnique({
        where: { id },
        select: { visibility: true, createdById: true, spaceId: true },
      })
      return m
    }
    case 'Moment': {
      const m = await prisma.moment.findUnique({
        where: { id },
        select: { isPublic: true, userId: true },
      })
      return m
    }
    default:
      return null
  }
}

/** 便捷：由主键判读可读性（内部先查快照） */
export async function canViewResourceById(
  kind: ResourceKind,
  id: number,
  userId: number | null | undefined,
): Promise<boolean> {
  const snapshot = await fetchResourceSnapshot(kind, id)
  if (!snapshot) return false
  return canViewResource(kind, snapshot, userId)
}
