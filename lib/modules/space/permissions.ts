/**
 * Space 权限体系（RBAC）：
 * User → SpaceMember → Role(OWNER/MEMBER/VIEWER) → Resource → Visibility
 * 所有资源访问必须经过这里，避免不同 API 各自实现权限逻辑（IDOR 防护）。
 */
import { prisma } from '../../db'
import { getSiteOwnerId } from '../../site-owner'

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
    return memory.visibility === 'SPACE'
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
//
// **P0 修复（评审 S-3 / A-1，账号接管链之一）**：
// 旧规则是「无 Space 成员身份 = 单用户 = OWNER」，而 /api/register 公开 ——
// 新注册用户天然没有任何空间成员身份，于是被判成 OWNER，可读全站审计、治理他人内容、
// 改站点设置。现在主人身份只认数据库显式字段 User.siteRole='SITE_OWNER'
// （lib/site-owner.ts），其余用户一律 USER；空间内的 OWNER 只影响 canManageSpace。
// ============================================================
export interface UserCapabilities {
  /** 站点主人（唯一，User.siteRole='SITE_OWNER'） */
  isOwner: boolean
  /**
   * 旅行/相册/碎碎念/留言 的增删改：任何登录用户都可以管理**自己的**内容，
   * 归属/可见性由 service 层逐条校验（P0 保持功能不回归：此前 OWNER/MEMBER 才有）。
   */
  canManageContent: boolean
  /** 举报审核/评论隐藏/屏蔽（仅站点主人） */
  canManageSocial: boolean
  /** 站点级设置：管理员治理、他人内容处置等（仅站点主人） */
  canManageSettings: boolean
  /** 空间治理（邀请/移除成员/角色调整）：站点主人，或在该空间里是 OWNER */
  canManageSpace: boolean
  /** 审计日志（仅站点主人） */
  canViewAudit: boolean
}

/**
 * 取用户能力（3.6 后台能力模块化）。
 *
 * 规则（P0 反转）：
 * - isOwner = User.siteRole === 'SITE_OWNER'（显式主人，不再用「无空间成员」推导）；
 * - canManageContent = true（登录即可管理自己的内容，归属由 service 层校验）；
 * - canManageSocial / canManageSettings / canViewAudit = isOwner；
 * - canManageSpace = isOwner 或该用户在某空间是 OWNER（memberships 查询保留）。
 */
export async function getUserCapabilities(
  userId: number,
  username?: string | null,
): Promise<UserCapabilities> {
  // username 未显式传入时回查一次（调用方多数只有 userId）
  const uname =
    username ??
    (await prisma.user
      .findUnique({ where: { id: userId }, select: { username: true } })
      .then((u) => u?.username ?? null)
      .catch(() => null))

  // 站点主人：DB 异常时 getSiteOwnerId 返回 null → isOwner=false（fail-closed 到普通用户）
  const ownerId = await getSiteOwnerId()
  const isOwner = ownerId !== null && ownerId === userId

  const memberships = await prisma.spaceMember.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ userId }, ...(uname ? [{ username: uname }] : [])],
    },
    select: { role: true },
  })
  const isSpaceOwner = memberships.some((m) => m.role === 'OWNER')

  return {
    isOwner,
    canManageContent: true,
    canManageSocial: isOwner,
    canManageSettings: isOwner,
    canManageSpace: isOwner || isSpaceOwner,
    canViewAudit: isOwner,
  }
}

export type CapabilityKey = Exclude<keyof UserCapabilities, 'isOwner'>

/** 判断用户是否拥有某能力（3.6 写接口角色校验用） */
export async function hasCapability(userId: number, capability: CapabilityKey): Promise<boolean> {
  const caps = await getUserCapabilities(userId)
  return caps[capability] === true
}
