/**
 * Space 业务服务
 */
import { createHash, randomBytes } from 'crypto'
import { prisma } from '../../db'
import { PrismaSpaceRepository } from './space.repository'
import { requireSpaceOwner, requireSpaceMember, requireSpaceRole, SpaceAccessError, type SpaceRole } from './permissions'
import { writeAuditLog } from '../audit/audit-log.service'

const SLUG_RE = /^[a-z0-9-]{2,80}$/

/**
 * 由空间名派生 ASCII slug。
 *
 * **P0 修复**：原先 slug 由前端生成，且前端的清洗规则**保留中文**
 * （`SpacePanel.tsx` 里 `/^[^a-z0-9\u4e00-\u9fa5]+/`），而服务端只接受
 * `^[a-z0-9-]{2,80}$` —— 于是「我们的小家」这类中文名空间 100% 创建失败（400）。
 * 真库佐证：34 个空间全是自动创建的 `personal-*`，没有一个用户自建空间。
 *
 * 现在服务端统一生成：中文名派生为空 → 回退随机 `sp-xxxxxxxx`。
 * 刻意不支持中文 slug：`/space/[slug]` 要进 URL 与分享链接，ASCII 更稳
 * （编码、大小写、复制粘贴都少一类问题）。
 */
export function slugifySpaceName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function randomSpaceSlug(): string {
  return `sp-${randomBytes(4).toString('hex')}`
}

const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** 生成人类友好的邀请码（8 位，形如 7XK2-M9PQ） */
export function generateInviteCode(): string {
  const bytes = randomBytes(8)
  let code = ''
  for (let i = 0; i < bytes.length; i++) {
    code += INVITE_CODE_ALPHABET[bytes[i] % INVITE_CODE_ALPHABET.length]
  }
  return `${code.slice(0, 4)}-${code.slice(4, 8)}`
}

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code.replace(/[^A-Z0-9]/gi, '').toUpperCase()).digest('hex')
}

export interface CreateSpaceInput {
  name: string
  slug: string
  description?: string
  /** 空间类型（COUPLE/FAMILY/FRIENDS/SOLO/OTHER）；缺省 OTHER */
  spaceType?: string
}

const SPACE_TYPES = ['COUPLE', 'FAMILY', 'FRIENDS', 'SOLO', 'OTHER'] as const

export function isSpaceType(value: unknown): value is (typeof SPACE_TYPES)[number] {
  return typeof value === 'string' && (SPACE_TYPES as readonly string[]).includes(value)
}

export interface UpdateSpaceInput {
  name?: string
  description?: string | null
  spaceType?: string
  coverMediaId?: number | null
}

export class SpaceService {
  constructor(private readonly repo: PrismaSpaceRepository) {}

  async createSpace(username: string, input: CreateSpaceInput): Promise<{ id: number; slug: string }> {
    const name = (input.name || '').trim()
    if (name.length < 2 || name.length > 200) {
      throw new Error('空间名称需为 2-200 个字符')
    }

    /**
     * slug 一律由服务端决定（P0 修复，见 slugifySpaceName 注释）。
     * 传入的 slug 仅在合法时作为首选，非法/缺失时自动派生，**不再抛错** ——
     * 前端已不再让用户填写这个字段，报错只会变成对用户莫名的「空间标识不合法」。
     */
    const explicit = (input.slug || '').trim().toLowerCase()
    const base = explicit && SLUG_RE.test(explicit) ? explicit : slugifySpaceName(name) || randomSpaceSlug()

    const spaceType = isSpaceType(input.spaceType) ? input.spaceType : 'OTHER'

    // slug 全局唯一：冲突时追加随机后缀重试（与 ensurePersonalSpace 同一套做法）
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base.slice(0, 68)}-${randomBytes(2).toString('hex')}`
      if (await this.repo.slugExists(slug)) continue
      try {
        const id = await this.repo.create({
          name,
          slug,
          description: input.description,
          ownerUsername: username,
          spaceType,
        })
        await writeAuditLog({
          username,
          action: 'CREATE',
          resourceType: 'Space',
          resourceId: String(id),
          spaceId: id,
          metadata: { name, slug, spaceType },
        }).catch(() => {})
        return { id, slug }
      } catch {
        // 并发下 slug 被占用：换一个再试
      }
    }
    throw new Error('空间标识生成失败，请重试')
  }

  async listMySpaces(username: string) {
    return this.repo.listForUser(username)
  }

  async getSpace(username: string, spaceId: number) {
    const access = await requireSpaceMember(username, spaceId)
    return this.repo.findById(spaceId, access.role)
  }

  /** 按 slug 取空间详情（仅空间成员；非成员抛 SpaceAccessError → 路由返回 403） */
  async getSpaceBySlug(username: string, slug: string) {
    const found = await this.repo.findBySlug(slug)
    if (!found) return null
    return this.getSpace(username, found.id)
  }

  /** 更新空间自身（改名 / 改简介 / 改类型 / 换封面）：仅 OWNER */
  async updateSpace(actor: string, spaceId: number, input: UpdateSpaceInput): Promise<void> {
    await requireSpaceOwner(actor, spaceId)

    const patch: UpdateSpaceInput = {}
    if (input.name !== undefined) {
      const name = String(input.name).trim()
      if (name.length < 2 || name.length > 200) throw new Error('空间名称需为 2-200 个字符')
      patch.name = name
    }
    if (input.description !== undefined) {
      const desc = input.description === null ? null : String(input.description).trim()
      if (desc && desc.length > 500) throw new Error('简介最多 500 个字符')
      patch.description = desc || null
    }
    if (input.spaceType !== undefined) {
      if (!isSpaceType(input.spaceType)) throw new Error('空间类型不合法')
      patch.spaceType = input.spaceType
    }
    if (input.coverMediaId !== undefined) {
      patch.coverMediaId = input.coverMediaId === null ? null : Number(input.coverMediaId) || null
    }
    if (Object.keys(patch).length === 0) throw new Error('没有需要更新的内容')

    await this.repo.update(spaceId, patch)
    await writeAuditLog({
      username: actor,
      action: 'UPDATE',
      resourceType: 'Space',
      resourceId: String(spaceId),
      spaceId,
      metadata: patch as Record<string, unknown>,
    }).catch(() => {})
  }

  /**
   * 调整成员角色（仅 OWNER）。
   * 硬约束：不允许把**最后一个 OWNER** 降级，否则空间会变成没人能管的孤儿。
   */
  async updateMemberRole(actor: string, spaceId: number, memberUsername: string, role: SpaceRole) {
    await requireSpaceOwner(actor, spaceId)
    const name = (memberUsername || '').trim()
    if (!name) throw new Error('请输入成员用户名')
    if (!['OWNER', 'MEMBER', 'VIEWER'].includes(role)) throw new Error('角色不合法')

    const members = await this.repo.listMembers(spaceId)
    const target = members.find((m) => m.username === name && m.status === 'ACTIVE')
    if (!target) throw new Error('该成员不在空间中')

    if (target.role === 'OWNER' && role !== 'OWNER') {
      const owners = await this.repo.countActiveOwners(spaceId)
      if (owners <= 1) throw new Error('至少需要保留一位空间主人，请先转让主人身份')
    }

    await this.repo.addMember(spaceId, name, role)
    await writeAuditLog({
      username: actor,
      action: 'UPDATE_PERMISSIONS',
      resourceType: 'SpaceMember',
      resourceId: String(spaceId),
      spaceId,
      metadata: { member: name, from: target.role, to: role },
    }).catch(() => {})
  }

  async addMember(actor: string, spaceId: number, memberUsername: string, role: SpaceRole) {
    await requireSpaceOwner(actor, spaceId)
    const name = (memberUsername || '').trim()
    if (!name) throw new Error('请输入成员用户名')
    await this.repo.addMember(spaceId, name, role)
    await writeAuditLog({
      username: actor,
      action: 'INVITE_MEMBER',
      resourceType: 'SpaceMember',
      resourceId: String(spaceId),
      spaceId,
      metadata: { memberUsername: name, role },
    }).catch(() => {})
  }

  async listMembers(actor: string, spaceId: number) {
    await requireSpaceMember(actor, spaceId)
    return this.repo.listMembers(spaceId)
  }

  async removeMember(actor: string, spaceId: number, memberUsername: string) {
    await requireSpaceOwner(actor, spaceId)
    await this.repo.removeMember(spaceId, memberUsername)
    await writeAuditLog({
      username: actor,
      action: 'UPDATE_PERMISSIONS',
      resourceType: 'SpaceMember',
      resourceId: String(spaceId),
      spaceId,
      metadata: { removed: memberUsername },
    }).catch(() => {})
  }

  /** 成员自己退出空间（D1）：OWNER 不可退出（需删除空间），MEMBER/VIEWER 可退出 */
  async leaveSpace(actor: string, spaceId: number): Promise<void> {
    const access = await requireSpaceMember(actor, spaceId)
    if (access.isOwner) {
      throw new Error('空间主人不能退出，如需解散请删除空间')
    }
    await this.repo.removeMember(spaceId, actor)
    await writeAuditLog({
      username: actor,
      action: 'UPDATE_PERMISSIONS',
      resourceType: 'SpaceMember',
      resourceId: String(spaceId),
      spaceId,
      metadata: { left: actor },
    }).catch(() => {})
  }

  /** 生成邀请码（仅 OWNER） */
  async createInvite(actor: string, spaceId: number, role: SpaceRole = 'MEMBER', expiresInDays = 7) {
    await requireSpaceOwner(actor, spaceId)
    const code = generateInviteCode()
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    const id = await this.repo.createInvite({
      spaceId,
      role,
      expiresAt,
      createdBy: actor,
      tokenHash: hashInviteCode(code),
      code,
    })
    await writeAuditLog({
      username: actor,
      action: 'INVITE_MEMBER',
      resourceType: 'SpaceInvite',
      resourceId: String(spaceId),
      spaceId,
      metadata: { inviteId: id, role, expiresAt: expiresAt.toISOString() },
    }).catch(() => {})
    return { id, code, role, expiresAt: expiresAt.toISOString() }
  }

  /** 使用邀请码加入空间 */
  async joinByInvite(username: string, code: string) {
    const normalized = (code || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
    if (normalized.length < 6) {
      throw new Error('邀请码格式不正确')
    }
    const invite = await this.repo.findInviteByHash(hashInviteCode(normalized))
    if (!invite) {
      throw new Error('邀请码无效')
    }
    if (invite.usedAt) {
      throw new Error('该邀请码已被使用')
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new Error('该邀请码已过期')
    }

    // 防止重复加入/自邀
    const existing = await prisma.spaceMember.findUnique({
      where: { spaceId_username: { spaceId: invite.spaceId, username } },
    })
    if (existing && existing.status === 'ACTIVE') {
      throw new Error('你已经在该空间中')
    }
    await this.repo.addMember(invite.spaceId, username, invite.role)
    await this.repo.markInviteUsed(invite.id)

    await writeAuditLog({
      username,
      action: 'INVITE_MEMBER',
      resourceType: 'SpaceMember',
      resourceId: String(invite.spaceId),
      spaceId: invite.spaceId,
      metadata: { joinedByInvite: true, role: invite.role },
    }).catch(() => {})

    return {
      spaceId: invite.spaceId,
      spaceName: invite.space.name,
      role: invite.role,
    }
  }

  /** 查看空间邀请列表（成员可看，明文邀请码仅创建者可见） */
  async listInvites(actor: string, spaceId: number) {
    const access = await requireSpaceMember(actor, spaceId)
    const invites = await this.repo.listInvites(spaceId)
    if (!access.isOwner) {
      // 非创建者不返回明文邀请码
      return invites.map((inv) => ({
        id: inv.id,
        spaceId: inv.spaceId,
        role: inv.role,
        expiresAt: inv.expiresAt,
        createdBy: inv.createdBy,
        usedAt: inv.usedAt,
        createdAt: inv.createdAt,
        status: inv.status,
      }))
    }
    return invites
  }

  /** 撤销邀请（仅 OWNER） */
  async revokeInvite(actor: string, spaceId: number, inviteId: number) {
    await requireSpaceOwner(actor, spaceId)
    await this.repo.revokeInvite(inviteId)
    await writeAuditLog({
      username: actor,
      action: 'UPDATE_PERMISSIONS',
      resourceType: 'SpaceInvite',
      resourceId: String(spaceId),
      spaceId,
      metadata: { inviteId },
    }).catch(() => {})
  }

  async deleteSpace(actor: string, spaceId: number): Promise<void> {
    await requireSpaceOwner(actor, spaceId)
    await this.repo.delete(spaceId)
    await writeAuditLog({
      username: actor,
      action: 'DELETE',
      resourceType: 'Space',
      resourceId: String(spaceId),
      spaceId,
    }).catch(() => {})
  }

  /** 空间动态（成员可看）：复用 AuditLog，零改库 */
  async getActivity(actor: string, spaceId: number, limit = 30) {
    await requireSpaceMember(actor, spaceId)
    return this.repo.listActivity(spaceId, limit)
  }

  /**
   * 取（或创建）该用户的「个人空间」。
   *
   * 为什么需要：`Memory.spaceId` 是必填列，`createMemory` 还要求空间成员角色。
   * 但前台「新建旅行」建出的 Travel `spaceId` 为空（注册流程也不创建任何 Space），
   * 于是 `POST /api/travels/:id/memories` 会直接 400「该旅行尚未关联空间」——
   * 个人旅行**根本无法添加回忆与照片**，这正是真机反馈"没法进一步设置"的根因之一。
   *
   * 语义：个人空间 = 该用户作为 OWNER 的第一个空间；没有就建一个 SOLO 空间。
   * 选择"复用已有 OWNER 空间"而不是每次新建，是为了不产生一堆空空间；
   * 也刻意不新建后回写 Travel.spaceId（避免改动既有旅行归属）。
   */
  async ensurePersonalSpace(username: string, userId?: number | null): Promise<number> {
    const mine = await prisma.spaceMember.findFirst({
      where: { username, status: 'ACTIVE', role: 'OWNER' },
      orderBy: { joinedAt: 'asc' },
      select: { spaceId: true },
    })
    if (mine) return mine.spaceId

    // slug 需全局唯一：用 userId/username 派生，冲突时附加随机后缀重试
    const base = `personal-${userId ?? username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60)
    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`
      try {
        const id = await this.repo.create({
          name: '我的旅行空间',
          slug,
          description: '个人旅行记忆空间（自动创建）',
          ownerUsername: username,
          ownerUserId: userId ?? null,
        })
        await prisma.space.update({ where: { id }, data: { spaceType: 'SOLO' } }).catch(() => {})
        await writeAuditLog({
          username,
          action: 'CREATE',
          resourceType: 'Space',
          resourceId: String(id),
          spaceId: id,
          metadata: { name: '我的旅行空间', slug, auto: 'ensurePersonalSpace' },
        }).catch(() => {})
        return id
      } catch {
        // slug 冲突或并发创建：重试
      }
    }
    // 兜底：并发下可能已被别的请求建好，再查一次
    const again = await prisma.spaceMember.findFirst({
      where: { username, status: 'ACTIVE', role: 'OWNER' },
      orderBy: { joinedAt: 'asc' },
      select: { spaceId: true },
    })
    if (again) return again.spaceId
    throw new Error('无法创建个人空间')
  }
}

export const spaceService = new SpaceService(new PrismaSpaceRepository())

