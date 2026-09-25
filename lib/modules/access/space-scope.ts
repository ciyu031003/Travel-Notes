/**
 * 「我的活跃空间」唯一查询入口。
 *
 * 为什么需要它（P0 修复）：
 * 项目里曾有 **三处** 各自抄一遍「查我的活跃空间」——`travel.service.myActiveSpaceIds`、
 * `lib/modules/access` 的 `isSpaceActiveMember`、`album.service.canManageAlbum`。
 * 抄写本身不算错，错在它们**全部只按 `userId` 过滤**，而 `SpaceMember.userId`
 * 在「加入空间」路径里长期没有被写入（见 `space.repository.ts#addMember`）。
 * 于是用邀请码加入的成员在这三处全部「不存在」：既看不到也改不了空间内容。
 *
 * 本模块同时按 `userId` 与 `username` 两种键查（`SpaceMember` 的规范键是
 * `(spaceId, username)`，`userId` 是后加的便利键），并在写入侧补齐 `userId`，
 * 两边一起收口，任何一边缺失都不会静默失效。
 */
import { prisma } from '../../db'
import type { SpaceRole } from '../space/permissions'

export interface ActiveSpaceMembership {
  spaceId: number
  role: SpaceRole
  joinedAt: Date
}

function memberKeyWhere(
  userId?: number | null,
  username?: string | null,
): { OR: Array<Record<string, unknown>> } | null {
  const or: Array<Record<string, unknown>> = []
  if (userId) or.push({ userId })
  if (username) or.push({ username })
  return or.length ? { OR: or } : null
}

function toRole(role: string): SpaceRole {
  if (role === 'OWNER' || role === 'MEMBER' || role === 'VIEWER') return role
  return 'VIEWER'
}

/**
 * 我的活跃空间成员关系（含角色），按加入时间倒序。
 * 未登录/两键皆空时返回空数组。
 */
export async function myActiveMemberships(
  userId?: number | null,
  username?: string | null,
): Promise<ActiveSpaceMembership[]> {
  const key = memberKeyWhere(userId, username)
  if (!key) return []
  try {
    const rows = await prisma.spaceMember.findMany({
      where: { status: 'ACTIVE', ...key },
      select: { spaceId: true, role: true, joinedAt: true },
      orderBy: { joinedAt: 'desc' },
    })
    return rows.map((r) => ({ spaceId: r.spaceId, role: toRole(r.role), joinedAt: r.joinedAt }))
  } catch {
    return []
  }
}

/**
 * 我的活跃空间 id 列表（列表可见性用）。
 * 刻意保留「查询失败返回空数组」的既有语义：列表接口宁可少显示，也不 500。
 */
export async function myActiveSpaceIds(
  userId?: number | null,
  username?: string | null,
): Promise<number[]> {
  const memberships = await myActiveMemberships(userId, username)
  const ids: number[] = []
  for (const m of memberships) {
    if (!ids.includes(m.spaceId)) ids.push(m.spaceId)
  }
  return ids
}

/**
 * 我是否是该空间的「内容编辑者」（OWNER / MEMBER）。
 * VIEWER 与非成员一律 false。
 */
export async function isSpaceContentEditor(
  spaceId: number | null | undefined,
  userId?: number | null,
  username?: string | null,
): Promise<boolean> {
  if (!spaceId) return false
  const key = memberKeyWhere(userId, username)
  if (!key) return false
  try {
    const member = await prisma.spaceMember.findFirst({
      where: { spaceId, status: 'ACTIVE', role: { in: ['OWNER', 'MEMBER'] }, ...key },
      select: { id: true },
    })
    return !!member
  } catch {
    return false
  }
}

/**
 * 内容可见性 where 片段：`我名下的 ∪ 公开的 ∪ 我所在空间里的`。
 *
 * 用途：让**列表**读路径与**详情**读路径（`canViewResource`）口径一致。
 * 历史上 `listTravels` 只认 ownerId、`listAlbums` 只认 userId，而详情走
 * `canViewResourceById` 支持空间成员 —— 「列表里没有、直接开链接又能看」正是
 * 这个不一致造成的，用户会误判成「同步丢了」。
 *
 * @param ownerField 资源上指向「个人归属」的字段名：Travel 用 `ownerId`，Album/Media 用 `userId`
 * @param spaceVisibility 仅空间成员可见的 `visibility` 取值；`null` 表示该资源没有 visibility 列
 */
export function spaceScopedWhere(
  userId: number | null | undefined,
  ownerField: string,
  spaceIds: number[],
  spaceVisibility: string[] | null = null,
): Record<string, unknown> {
  if (!userId) return { isPublic: true }
  if (spaceIds.length === 0) return { OR: [{ [ownerField]: userId }, { isPublic: true }] }
  return {
    OR: [
      { [ownerField]: userId },
      { isPublic: true },
      {
        spaceId: { in: spaceIds },
        ...(spaceVisibility ? { visibility: { in: spaceVisibility } } : {}),
      },
    ],
  }
}
