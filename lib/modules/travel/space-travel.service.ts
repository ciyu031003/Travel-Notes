/**
 * Space 级 Travel 业务服务（§29）：按空间管理旅行，统一走 RBAC + 审计
 * 注意：与并发会话的 lib/modules/travel/travel.service.ts（P2 行程/花费规划）并存，
 * 本服务负责公开的、按空间隔离的旅行 CRUD。
 */
import { PrismaTravelRepository, prismaTravelRepository, type TravelStatus, type TravelVisibility, type UpdateTravelPatch } from './space-travel.repository'
import { requireSpaceRole } from '../space/permissions'
import { writeAuditLog } from '../audit/audit-log.service'

const SLUG_RE = /^[a-z0-9-]{2,80}$/
const TITLE_MAX = 255
const STATUSES: TravelStatus[] = ['PLANNED', 'ONGOING', 'COMPLETED']
const VISIBILITIES: TravelVisibility[] = ['PRIVATE', 'COUPLE', 'PUBLIC']

export interface CreateTravelInput {
  spaceId: number
  title: string
  slug: string
  description?: string | null
  startDate?: string | null
  endDate?: string | null
  status?: TravelStatus
  visibility?: TravelVisibility
}

export class TravelService {
  constructor(private readonly repo: PrismaTravelRepository) {}

  async createTravel(username: string, input: CreateTravelInput): Promise<{ id: number }> {
    const spaceId = Number(input.spaceId)
    if (!Number.isFinite(spaceId)) throw new Error('无效的空间 ID')
    await requireSpaceRole(username, spaceId, ['OWNER', 'MEMBER'])

    const title = (input.title || '').trim()
    const slug = (input.slug || '').trim().toLowerCase()
    if (!title || title.length > TITLE_MAX) throw new Error('旅行标题需为 1-255 个字符')
    if (!SLUG_RE.test(slug)) throw new Error('旅行标识需为 2-80 位小写字母、数字或连字符')
    if (await this.repo.slugExists(spaceId, slug)) throw new Error('该空间下已存在相同旅行标识')
    if (input.status && !STATUSES.includes(input.status)) throw new Error('旅行状态无效')
    if (input.visibility && !VISIBILITIES.includes(input.visibility)) throw new Error('可见性无效')

    const id = await this.repo.create({
      spaceId,
      title,
      slug,
      description: input.description ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      status: input.status ?? 'PLANNED',
      visibility: input.visibility ?? 'COUPLE',
    })
    await writeAuditLog({
      username,
      action: 'CREATE',
      resourceType: 'Travel',
      resourceId: String(id),
      spaceId,
      metadata: { title, slug },
    }).catch(() => {})
    return { id }
  }

  async listTravels(username: string, spaceId: number) {
    await requireSpaceRole(username, spaceId, ['OWNER', 'MEMBER', 'VIEWER'])
    return this.repo.listForSpace(spaceId)
  }

  async getTravel(username: string, travelId: number) {
    const t = await this.repo.findById(travelId)
    if (!t) throw new Error('旅行不存在')
    await requireSpaceRole(username, t.spaceId, ['OWNER', 'MEMBER', 'VIEWER'])
    return t
  }

  async updateTravel(username: string, travelId: number, patch: UpdateTravelPatch) {
    const t = await this.repo.findById(travelId)
    if (!t) throw new Error('旅行不存在')
    await requireSpaceRole(username, t.spaceId, ['OWNER', 'MEMBER'])
    if (patch.title !== undefined) {
      const title = (patch.title || '').trim()
      if (!title || title.length > TITLE_MAX) throw new Error('旅行标题需为 1-255 个字符')
      patch.title = title
    }
    if (patch.slug !== undefined) {
      const slug = (patch.slug || '').trim().toLowerCase()
      if (!SLUG_RE.test(slug)) throw new Error('旅行标识需为 2-80 位小写字母、数字或连字符')
      if (await this.repo.slugExists(t.spaceId, slug, travelId)) throw new Error('该空间下已存在相同旅行标识')
      patch.slug = slug
    }
    if (patch.status !== undefined && !STATUSES.includes(patch.status)) throw new Error('旅行状态无效')
    if (patch.visibility !== undefined && !VISIBILITIES.includes(patch.visibility)) throw new Error('可见性无效')
    const updated = await this.repo.update(travelId, patch)
    await writeAuditLog({
      username,
      action: 'UPDATE',
      resourceType: 'Travel',
      resourceId: String(travelId),
      spaceId: t.spaceId,
      metadata: { fields: Object.keys(patch) },
    }).catch(() => {})
    return updated
  }

  async deleteTravel(username: string, travelId: number): Promise<void> {
    const t = await this.repo.findById(travelId)
    if (!t) throw new Error('旅行不存在')
    await requireSpaceRole(username, t.spaceId, ['OWNER', 'MEMBER'])
    await this.repo.remove(travelId)
    await writeAuditLog({
      username,
      action: 'DELETE',
      resourceType: 'Travel',
      resourceId: String(travelId),
      spaceId: t.spaceId,
    }).catch(() => {})
  }
}

export const travelService = new TravelService(prismaTravelRepository)
