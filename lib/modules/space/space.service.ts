/**
 * Space 业务服务
 */
import { PrismaSpaceRepository } from './space.repository'
import { requireSpaceOwner, requireSpaceMember, SpaceAccessError, type SpaceRole } from './permissions'
import { writeAuditLog } from '../audit/audit-log.service'

const SLUG_RE = /^[a-z0-9-]{2,80}$/

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
