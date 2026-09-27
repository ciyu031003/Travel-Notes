/**
 * Space 级 Travel 业务服务（§29）：按空间管理旅行，统一走 RBAC + 审计
 * 注意：与并发会话的 lib/modules/travel/travel.service.ts（P2 行程/花费规划）并存，
 * 本服务负责公开的、按空间隔离的旅行 CRUD。
 */
import { PrismaTravelRepository, prismaTravelRepository, type TravelStatus, type TravelVisibility, type TravelType, type UpdateTravelPatch } from './space-travel.repository'
import { requireSpaceRole, SpaceAccessError, type SpaceRole } from '../space/permissions'
import { writeAuditLog } from '../audit/audit-log.service'
import { syncTravelPost, unpublishTravelPost } from '../social/travel-post.service'
import { prisma } from '../../db'

const SLUG_RE = /^[a-z0-9-]{2,80}$/
const TITLE_MAX = 255
const STATUSES: TravelStatus[] = ['PLANNED', 'ONGOING', 'COMPLETED']
const VISIBILITIES: TravelVisibility[] = ['PRIVATE', 'SPACE', 'PUBLIC']
const TRAVEL_TYPES: TravelType[] = ['ALONE', 'COUPLE', 'FAMILY', 'FRIENDS', 'BFF', 'GROUP', 'OTHER']

export interface CreateTravelInput {
  spaceId: number
  title: string
  slug: string
  description?: string | null
  startDate?: string | null
  endDate?: string | null
  status?: TravelStatus
  visibility?: TravelVisibility
  travelType?: TravelType
  companions?: unknown
}

export class TravelService {
  constructor(private readonly repo: PrismaTravelRepository) {}

  /**
   * 旅行访问判权：**空间旅行看空间角色，个人旅行看创建者所有权。**
   *
   * 历史缺陷（真机反馈「点删除 → 提示删除失败，无法删除」）：
   * getTravel / updateTravel / deleteTravel 一律调用 requireSpaceRole，
   * 而 requireSpaceMember 是按 `(spaceId, username)` 唯一键查 SpaceMember 的 ——
   * 个人旅行（App 里新建的默认就是个人旅行）spaceId 为 **NULL**，
   * 永远查不到成员行 → 一律被判「无权访问该空间」→ **删不掉、也改不了**。
   * 线上库核对吻合：4 本旅行全部 spaceId=NULL、ownerId=1（用户账号）。
   *
   * 个人旅行不属于任何空间，它的授权依据只能是 ownerId
   * （与 travel.service 的 canActOnContent 口径一致）。
   */
  private async requireTravelAccess(username: string, travelId: number, roles: SpaceRole[]): Promise<void> {
    const t = await prisma.travel.findUnique({
      where: { id: travelId },
      select: { spaceId: true, ownerId: true },
    })
    if (!t) throw new Error('旅行不存在')
    if (t.spaceId == null) {
      const user = await prisma.user.findUnique({ where: { username }, select: { id: true } })
      if (!user || t.ownerId == null || t.ownerId !== user.id) {
        throw new SpaceAccessError('这本旅行不在你名下，无法操作')
      }
      return
    }
    await requireSpaceRole(username, t.spaceId, roles)
  }

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
    if (input.travelType && !TRAVEL_TYPES.includes(input.travelType)) throw new Error('旅行类型无效')

    const id = await this.repo.create({
      spaceId,
      title,
      slug,
      description: input.description ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      status: input.status ?? 'PLANNED',
      visibility: input.visibility ?? 'SPACE',
      travelType: input.travelType ?? 'ALONE',
      companions: input.companions ?? null,
    })
    await writeAuditLog({
      username,
      action: 'CREATE',
      resourceType: 'Travel',
      resourceId: String(id),
      spaceId,
      metadata: { title, slug },
    }).catch(() => {})
    await syncTravelPost(id).catch(() => {})
    return { id }
  }

  async listTravels(username: string, spaceId: number) {
    await requireSpaceRole(username, spaceId, ['OWNER', 'MEMBER', 'VIEWER'])
    return this.repo.listForSpace(spaceId)
  }

  async getTravel(username: string, travelId: number) {
    const t = await this.repo.findById(travelId)
    if (!t) throw new Error('旅行不存在')
    // 个人旅行按 ownerId 授权；空间旅行按空间角色（见 requireTravelAccess 注释）
    await this.requireTravelAccess(username, travelId, ['OWNER', 'MEMBER', 'VIEWER'])
    return t
  }

  async updateTravel(username: string, travelId: number, patch: UpdateTravelPatch) {
    const t = await this.repo.findById(travelId)
    if (!t) throw new Error('旅行不存在')
    await this.requireTravelAccess(username, travelId, ['OWNER', 'MEMBER'])
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
    if (patch.travelType !== undefined && !TRAVEL_TYPES.includes(patch.travelType)) throw new Error('旅行类型无效')
    const updated = await this.repo.update(travelId, patch)
    await syncTravelPost(travelId).catch(() => {})
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
    // 关键修复：个人旅行（spaceId=NULL）此前在这里被判「无权访问该空间」而删不掉
    await this.requireTravelAccess(username, travelId, ['OWNER', 'MEMBER'])
    await unpublishTravelPost(travelId).catch(() => {})
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
