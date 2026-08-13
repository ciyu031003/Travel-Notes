/**
 * Space 权限体系（RBAC）：
 * User → SpaceMember → Role(OWNER/MEMBER/VIEWER) → Resource → Visibility
 * 所有资源访问必须经过这里，避免不同 API 各自实现权限逻辑（IDOR 防护）。
 */
import { prisma } from '../../db'

export class SpaceAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpaceAccessError'
  }
}

export type SpaceRole = 'OWNER' | 'MEMBER' | 'VIEWER'

export interface SpaceAccess {
  spaceId: number
  role: SpaceRole
  isOwner: boolean
}

function toSpaceRole(role: string): SpaceRole {
  if (role === 'OWNER' || role === 'MEMBER' || role === 'VIEWER') return role
  return 'VIEWER'
}

/** 必须是空间活跃成员，否则抛错 */
export async function requireSpaceMember(username: string, spaceId: number): Promise<SpaceAccess> {
  const member = await prisma.spaceMember.findUnique({
    where: { spaceId_username: { spaceId, username } },
  })
  if (!member || member.status !== 'ACTIVE') {
    throw new SpaceAccessError('无权访问该空间')
  }
  const role = toSpaceRole(member.role)
  return { spaceId, role, isOwner: role === 'OWNER' }
}

/** 必须是指定角色之一（OWNER/MEMBER），VIEWER 只读 */
export async function requireSpaceRole(
  username: string,
  spaceId: number,
  roles: SpaceRole[],
): Promise<SpaceAccess> {
  const access = await requireSpaceMember(username, spaceId)
  if (!roles.includes(access.role)) {
    throw new SpaceAccessError('当前角色无权执行该操作')
  }
  return access
}

/** 仅 OWNER 可执行 */
export function requireSpaceOwner(username: string, spaceId: number): Promise<SpaceAccess> {
  return requireSpaceRole(username, spaceId, ['OWNER'])
}

export async function canReadMemory(username: string, memoryId: number): Promise<boolean> {
  const memory = await prisma.memory.findUnique({
    where: { id: memoryId },
    select: { spaceId: true, visibility: true, createdBy: true },
  })
  if (!memory) return false
  if (memory.visibility === 'PUBLIC') return true
  if (memory.createdBy === username) return true
  try {
    await requireSpaceMember(username, memory.spaceId)
    return memory.visibility === 'COUPLE'
  } catch {
    return false
  }
}

export async function canEditMemory(username: string, memoryId: number): Promise<boolean> {
  const memory = await prisma.memory.findUnique({
    where: { id: memoryId },
    select: { spaceId: true, createdBy: true },
  })
  if (!memory) return false
  if (memory.createdBy === username) return true
  try {
    await requireSpaceRole(username, memory.spaceId, ['OWNER', 'MEMBER'])
    return true
  } catch {
    return false
  }
}

export async function canDeleteMedia(username: string, mediaId: number): Promise<boolean> {
  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { spaceId: true },
  })
  if (!media || !media.spaceId) return false
  try {
    await requireSpaceRole(username, media.spaceId, ['OWNER', 'MEMBER'])
    return true
  } catch {
    return false
  }
}
