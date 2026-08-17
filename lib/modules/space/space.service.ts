/**
 * Space 业务服务
 */
import { createHash, randomBytes } from 'crypto'
import { prisma } from '../../db'
import { PrismaSpaceRepository } from './space.repository'
import { requireSpaceOwner, requireSpaceMember, requireSpaceRole, SpaceAccessError, type SpaceRole } from './permissions'
import { writeAuditLog } from '../audit/audit-log.service'

const SLUG_RE = /^[a-z0-9-]{2,80}$/

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
}

export class SpaceService {
  constructor(private readonly repo: PrismaSpaceRepository) {}

  async createSpace(username: string, input: CreateSpaceInput): Promise<{ id: number }> {
    const name = (input.name || '').trim()
    const slug = (input.slug || '').trim().toLowerCase()
    if (name.length < 2 || name.length > 200) {
      throw new Error('空间名称需为 2-200 个字符')
    }
    if (!SLUG_RE.test(slug)) {
      throw new Error('空间标识需为 2-80 位小写字母、数字或连字符')
    }
    if (await this.repo.slugExists(slug)) {
      throw new Error('空间标识已存在')
    }

    const id = await this.repo.create({ name, slug, description: input.description, ownerUsername: username })
    await writeAuditLog({
      username,
      action: 'CREATE',
      resourceType: 'Space',
      resourceId: String(id),
      spaceId: id,
      metadata: { name, slug },
    }).catch(() => {})
    return { id }
  }

  async listMySpaces(username: string) {
    return this.repo.listForUser(username)
  }

  async getSpace(username: string, spaceId: number) {
    await requireSpaceMember(username, spaceId)
    return this.repo.findById(spaceId)
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

  /** 查看空间邀请列表（成员可看） */
  async listInvites(actor: string, spaceId: number) {
    await requireSpaceMember(actor, spaceId)
    return this.repo.listInvites(spaceId)
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
}

export const spaceService = new SpaceService(new PrismaSpaceRepository())
