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

// ============================================================
// 3.6 后台能力模块化：用户能力（capabilities）
// 移动端不设 /admin，管理入口按能力下沉到各功能模块。
// 规则：无 Space 成员身份 = 单用户 = OWNER；否则按 Space 角色推导。
// ============================================================
export interface UserCapabilities {
  isOwner: boolean
  /** 旅行/相册/碎碎念/留言 的增删改（OWNER / MEMBER） */
  canManageContent: boolean
  /** 举报审核/评论隐藏/屏蔽（仅 OWNER） */
  canManageSocial: boolean
  /** 账号/密码/邮箱/账号名/纪念日系统设置（仅 OWNER） */
  canManageSettings: boolean
  /** 邀请/移除成员/角色调整（仅 OWNER） */
  canManageSpace: boolean
  /** 审计日志（仅 OWNER） */
  canViewAudit: boolean
}

export async function getUserCapabilities(userId: number): Promise<UserCapabilities> {
  const memberships = await prisma.spaceMember.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { role: true },
  })
  const isOwner = memberships.length === 0 || memberships.some((m) => m.role === 'OWNER')
  const canManageContent = isOwner || memberships.some((m) => m.role === 'MEMBER')
  return {
    isOwner,
    canManageContent,
    canManageSocial: isOwner,
    canManageSettings: isOwner,
    canManageSpace: isOwner,
    canViewAudit: isOwner,
  }
}

export type CapabilityKey = Exclude<keyof UserCapabilities, 'isOwner'>

/** 判断用户是否拥有某能力（3.6 写接口角色校验用） */
export async function hasCapability(userId: number, capability: CapabilityKey): Promise<boolean> {
  const caps = await getUserCapabilities(userId)
  return caps[capability] === true
}
