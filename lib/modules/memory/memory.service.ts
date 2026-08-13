/**
 * Memory 业务服务（§31）：回忆管理，统一走 RBAC + 审计
 */
import { PrismaMemoryRepository, prismaMemoryRepository, type MemoryVisibility, type UpdateMemoryPatch } from './memory.repository'
import { requireSpaceRole } from '../space/permissions'
import { writeAuditLog } from '../audit/audit-log.service'

const TITLE_MAX = 255
const MOOD_MAX = 50
const VISIBILITIES: MemoryVisibility[] = ['PRIVATE', 'COUPLE', 'PUBLIC']

export interface CreateMemoryInput {
  spaceId: number
  travelId?: number | null
  travelDayId?: number | null
  title: string
  content?: string | null
  happenedAt?: string | null
  locationId?: number | null
  mood?: string | null
  visibility?: MemoryVisibility
}

export class MemoryService {
  constructor(private readonly repo: PrismaMemoryRepository) {}

  async createMemory(username: string, input: CreateMemoryInput): Promise<{ id: number }> {
    const spaceId = Number(input.spaceId)
    if (!Number.isFinite(spaceId)) throw new Error('无效的空间 ID')
    await requireSpaceRole(username, spaceId, ['OWNER', 'MEMBER'])

    const title = (input.title || '').trim()
    if (!title || title.length > TITLE_MAX) throw new Error('回忆标题需为 1-255 个字符')
    if (input.mood && input.mood.length > MOOD_MAX) throw new Error('心情标签过长')
    if (input.visibility && !VISIBILITIES.includes(input.visibility)) throw new Error('可见性无效')

    const id = await this.repo.create({
      spaceId,
      title,
      content: input.content ?? null,
      travelId: input.travelId ?? null,
      travelDayId: input.travelDayId ?? null,
      happenedAt: input.happenedAt ? new Date(input.happenedAt) : null,
      locationId: input.locationId ?? null,
      mood: input.mood ?? null,
      visibility: input.visibility ?? 'COUPLE',
      createdBy: username,
    })
    await writeAuditLog({
      username,
      action: 'CREATE',
      resourceType: 'Memory',
      resourceId: String(id),
      spaceId,
      metadata: { title },
    }).catch(() => {})
    return { id }
  }

  async listMemories(username: string, spaceId: number, travelId?: number | null) {
    await requireSpaceRole(username, spaceId, ['OWNER', 'MEMBER', 'VIEWER'])
    return this.repo.listForSpace(spaceId, travelId ?? null)
  }

  async getMemory(username: string, memoryId: number) {
    const m = await this.repo.findById(memoryId)
    if (!m) throw new Error('回忆不存在')
    await requireSpaceRole(username, m.spaceId, ['OWNER', 'MEMBER', 'VIEWER'])
    return m
  }

  async updateMemory(username: string, memoryId: number, patch: UpdateMemoryPatch) {
    const m = await this.repo.findById(memoryId)
    if (!m) throw new Error('回忆不存在')
    await requireSpaceRole(username, m.spaceId, ['OWNER', 'MEMBER'])
    if (patch.title !== undefined) {
      const title = (patch.title || '').trim()
      if (!title || title.length > TITLE_MAX) throw new Error('回忆标题需为 1-255 个字符')
      patch.title = title
    }
    if (patch.mood !== undefined && patch.mood && patch.mood.length > MOOD_MAX) throw new Error('心情标签过长')
    if (patch.visibility !== undefined && !VISIBILITIES.includes(patch.visibility)) throw new Error('可见性无效')
    const updated = await this.repo.update(memoryId, patch)
    await writeAuditLog({
      username,
      action: 'UPDATE',
      resourceType: 'Memory',
      resourceId: String(memoryId),
      spaceId: m.spaceId,
      metadata: { fields: Object.keys(patch) },
    }).catch(() => {})
    return updated
  }

  async deleteMemory(username: string, memoryId: number): Promise<void> {
    const m = await this.repo.findById(memoryId)
    if (!m) throw new Error('回忆不存在')
    await requireSpaceRole(username, m.spaceId, ['OWNER', 'MEMBER'])
    await this.repo.remove(memoryId)
    await writeAuditLog({
      username,
      action: 'DELETE',
      resourceType: 'Memory',
      resourceId: String(memoryId),
      spaceId: m.spaceId,
    }).catch(() => {})
  }
}

export const memoryService = new MemoryService(prismaMemoryRepository)
