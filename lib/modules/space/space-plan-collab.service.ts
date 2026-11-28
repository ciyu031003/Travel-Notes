/**
 * 计划结构化 + 协同业务服务（P1a）。
 *
 * 职责边界：
 *   · 权限：读 = requireSpaceMember；写 = requireSpaceRole([OWNER, MEMBER])，VIEWER 只读（403）；
 *   · 校验：块字段白名单/长度/金额/时间格式，dayId 必须属于该计划（防跨计划挂块）；
 *   · 冲突：行级 version 不匹配 → PlanConflictError（路由转 409 + 当前行）；
 *   · 事件：所有写操作都由 repository 在同一事务里追加 SpacePlanEvent（数据落库 = 广播发生）。
 *
 * 老计划兼容：没有天/块的计划，detail 返回 days: [] / items: []，不报错。
 */
import { prisma } from '../../db'
import {
  prismaSpacePlanRepository,
  type PlanMeta,
  type SpacePlanRecord,
  type UpdatePlanPatch,
} from './space-plan.repository'
import {
  prismaSpacePlanCollabRepository,
  PLAN_EVENT_PAGE_MAX,
  wallClockToDate,
  type PlanDocSyncInput,
  type PlanDocSyncResult,
  type SpacePlanDayRecord,
  type SpacePlanItemRecord,
  type SpacePlanPresenceRecord,
  type SpacePlanDocRecord,
} from './space-plan-collab.repository'
import { requireSpaceMember, requireSpaceRole } from './permissions'
import { prismaSpaceRepository } from './space.repository'
import { PlanConflictError, PlanValidationError, SpacePlanNotFoundError } from './space-plan-errors'
import { getCollabWsUrl, issueCollabToken } from './plan-collab-token'
import type { PlanEngineItinerary, PlanItemKind } from './plan-engine'

const TITLE_MAX = 200
const PLACE_MAX = 200
const NOTE_MAX = 5000
const MEDIA_MAX = 50
const COST_MAX_CENTS = 1_000_000_000
const ITEM_KINDS: PlanItemKind[] = ['TRANSPORT', 'HOTEL', 'FOOD', 'SPOT', 'ACTIVITY', 'FLEX']

export interface PlanActor {
  username: string
  userId?: number | null
}

export interface PlanMemberPreview {
  username: string
  nickname: string | null
  avatarUrl: string | null
  role: 'OWNER' | 'MEMBER' | 'VIEWER'
}

export interface SpacePlanDetail {
  plan: SpacePlanRecord
  days: SpacePlanDayRecord[]
  /** 扁平块列表（前端按 dayId 分组；老计划为空数组） */
  items: SpacePlanItemRecord[]
  members: PlanMemberPreview[]
  presence: SpacePlanPresenceRecord[]
  docRevision: number
  lastEventId: number
}

export interface PlanItemInput {
  dayId?: number | string | null
  kind?: string | null
  title?: string | null
  place?: string | null
  costCents?: number | string | null
  note?: string | null
  /** 'YYYY-MM-DDTHH:mm'（墙上时间）或 ISO */
  startAt?: string | null
  endAt?: string | null
  done?: boolean | null
  mediaIds?: number[] | null
}

export interface PlanItemPatchInput extends PlanItemInput {
  /** 必填：行级乐观锁 */
  version?: number | string | null
}

export interface PlanItemWriteResult {
  item: SpacePlanItemRecord | null
  eventId: number | null
}

export interface PlanEventRecord {
  id: number
  planId: number
  actor: string
  action: string
  payload: unknown
  createdAt: string
}

// ============================================================
// 字段归一化
// ============================================================

function asTrimmed(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function normalizeKind(value: unknown): PlanItemKind {
  const text = asTrimmed(value).toUpperCase()
  if (!text) return 'SPOT'
  if (!ITEM_KINDS.includes(text as PlanItemKind)) throw new PlanValidationError('块类型不合法')
  return text as PlanItemKind
}

function normalizeItemTitle(value: unknown, required: boolean): string | undefined {
  if (value === undefined) {
    if (required) throw new PlanValidationError('块标题不能为空')
    return undefined
  }
  const text = asTrimmed(value)
  if (!text) {
    if (required) throw new PlanValidationError('块标题不能为空')
    return ''
  }
  if (text.length > TITLE_MAX) throw new PlanValidationError(`块标题最多 ${TITLE_MAX} 个字符`)
  return text
}

function normalizeOptionalText(value: unknown, max: number, label: string): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const text = asTrimmed(value)
  if (!text) return null
  if (text.length > max) throw new PlanValidationError(`${label}最多 ${max} 个字符`)
  return text
}

function normalizeCostCents(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw new PlanValidationError('花销需为不小于 0 的数字（单位：分）')
  const cents = Math.round(n)
  if (cents > COST_MAX_CENTS) throw new PlanValidationError('花销数值过大')
  return cents
}

/** 时间：带时区（Z / ±08:00）按时间点解析；否则按墙上时间（Date.UTC）解析 */
function normalizeTime(value: unknown, label: string): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const text = asTrimmed(value)
  if (!text) return null
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)
  const date = hasZone ? new Date(text) : wallClockToDate(text)
  if (!date || Number.isNaN(date.getTime())) throw new PlanValidationError(`${label}格式不正确`)
  return date
}

function normalizeVersion(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    throw new PlanValidationError('缺少 version：改块/删块必须带当前行的 version')
  }
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) throw new PlanValidationError('version 不合法')
  return n
}

function normalizeDayId(value: unknown): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new PlanValidationError('dayId 不合法')
  return n
}

function normalizeSortOrder(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(999, Math.trunc(n)))
}

// ============================================================
// 服务
// ============================================================

export class SpacePlanCollabService {
  constructor(
    private readonly planRepo = prismaSpacePlanRepository,
    private readonly collabRepo = prismaSpacePlanCollabRepository,
  ) {}

  /** 计划必须存在且属于该空间（跨空间按不存在处理，IDOR 防护） */
  private async loadPlan(spaceId: number, planId: number): Promise<SpacePlanRecord> {
    const plan = await this.planRepo.findById(planId)
    if (!plan || plan.spaceId !== spaceId) throw new SpacePlanNotFoundError()
    return plan
  }

  private async requireWriter(actor: PlanActor, spaceId: number): Promise<void> {
    await requireSpaceRole(actor.username, spaceId, ['OWNER', 'MEMBER'])
  }

  /** 详情：plan + days(含 items) + members + presence + docRevision + lastEventId */
  async getPlanDetail(actor: PlanActor, spaceId: number, planId: number): Promise<SpacePlanDetail> {
    await requireSpaceMember(actor.username, spaceId)
    const plan = await this.loadPlan(spaceId, planId)
    const [days, members, presence, lastEventId] = await Promise.all([
      this.collabRepo.findDays(planId),
      prismaSpaceRepository.listMembers(spaceId),
      this.collabRepo.listPresence(planId),
      this.collabRepo.lastEventId(planId),
    ])
    const items = days.flatMap((day) => day.items)
    const activeMembers: PlanMemberPreview[] = members
      .filter((member) => member.status === 'ACTIVE')
      .map((member) => ({
        username: member.username,
        nickname: member.nickname,
        avatarUrl: member.avatarUrl,
        role: member.role,
      }))
    return {
      plan,
      days,
      items,
      members: activeMembers,
      presence,
      docRevision: plan.docRevision,
      lastEventId,
    }
  }

  /** 计划级 PATCH（version 乐观锁）：不匹配 → PlanConflictError（409 + 当前行） */
  async patchPlan(
    actor: PlanActor,
    spaceId: number,
    planId: number,
    patch: UpdatePlanPatch,
    expectedVersion: number | null,
  ): Promise<{ plan: SpacePlanRecord; eventId: number | null }> {
    await this.requireWriter(actor, spaceId)
    await this.loadPlan(spaceId, planId)
    const result = await this.collabRepo.updatePlan(planId, expectedVersion, patch, actor.username)
    if (result.updated === 0) {
      const current = await this.loadPlan(spaceId, planId)
      throw new PlanConflictError({ current, expectedVersion: expectedVersion ?? undefined })
    }
    const plan = await this.loadPlan(spaceId, planId)
    return { plan, eventId: result.eventId }
  }

  // ---------- 块级 CRUD ----------

  async createItem(
    actor: PlanActor,
    spaceId: number,
    planId: number,
    input: PlanItemInput,
  ): Promise<PlanItemWriteResult> {
    await this.requireWriter(actor, spaceId)
    await this.loadPlan(spaceId, planId)
    const dayId = normalizeDayId(input.dayId)
    const day = await this.collabRepo.findDayWithPlan(dayId)
    if (!day || day.planId !== planId) throw new PlanValidationError('该天不属于这个计划')

    // 允许空块：没给标题时先用「待定」占位（P2 点开再填）
    const title = normalizeItemTitle(input.title, false) || '待定'
    const result = await this.collabRepo.createItem(planId, actor.username, {
      dayId,
      kind: normalizeKind(input.kind),
      startAt: normalizeTime(input.startAt, '开始时间') ?? null,
      endAt: normalizeTime(input.endAt, '结束时间') ?? null,
      title: String(title).slice(0, TITLE_MAX),
      place: normalizeOptionalText(input.place, PLACE_MAX, '地点') ?? null,
      costCents: normalizeCostCents(input.costCents) ?? null,
      note: normalizeOptionalText(input.note, NOTE_MAX, '备注') ?? null,
      done: input.done === true,
      mediaIds: await this.resolveMediaIds(spaceId, input.mediaIds),
    })
    return { item: result.item, eventId: result.eventId }
  }

  async updateItem(
    actor: PlanActor,
    spaceId: number,
    planId: number,
    itemId: number,
    input: PlanItemPatchInput,
  ): Promise<PlanItemWriteResult> {
    await this.requireWriter(actor, spaceId)
    await this.loadPlan(spaceId, planId)
    const expectedVersion = normalizeVersion(input.version)
    const found = await this.collabRepo.findItemWithPlan(itemId)
    if (!found || found.planId !== planId) throw new SpacePlanNotFoundError('这一块不存在，可能已被其他人删除')

    const title = normalizeItemTitle(input.title, false)
    const result = await this.collabRepo.updateItemVersioned(planId, itemId, actor.username, expectedVersion, {
      ...(title === undefined ? {} : { title }),
      ...(input.kind === undefined ? {} : { kind: normalizeKind(input.kind) }),
      ...(input.startAt === undefined ? {} : { startAt: normalizeTime(input.startAt, '开始时间') ?? null }),
      ...(input.endAt === undefined ? {} : { endAt: normalizeTime(input.endAt, '结束时间') ?? null }),
      ...(input.place === undefined ? {} : { place: normalizeOptionalText(input.place, PLACE_MAX, '地点') ?? null }),
      ...(input.costCents === undefined ? {} : { costCents: normalizeCostCents(input.costCents) ?? null }),
      ...(input.note === undefined ? {} : { note: normalizeOptionalText(input.note, NOTE_MAX, '备注') ?? null }),
      ...(input.done === undefined ? {} : { done: input.done === true }),
      ...(input.mediaIds === undefined ? {} : { mediaIds: await this.resolveMediaIds(spaceId, input.mediaIds) }),
    })
    if (result.conflict) {
      throw new PlanConflictError({ current: result.item, expectedVersion })
    }
    return { item: result.item, eventId: result.eventId }
  }

  async deleteItem(
    actor: PlanActor,
    spaceId: number,
    planId: number,
    itemId: number,
    version: unknown,
  ): Promise<{ deleted: true; eventId: number | null }> {
    await this.requireWriter(actor, spaceId)
    await this.loadPlan(spaceId, planId)
    const expectedVersion = normalizeVersion(version)
    const found = await this.collabRepo.findItemWithPlan(itemId)
    if (!found || found.planId !== planId) throw new SpacePlanNotFoundError('这一块不存在，可能已被其他人删除')
    const result = await this.collabRepo.deleteItemVersioned(planId, itemId, actor.username, expectedVersion)
    if (!result.deleted) {
      throw new PlanConflictError({ current: result.current, expectedVersion })
    }
    return { deleted: true, eventId: result.eventId }
  }

  /** 原子勾选：不需要 version（只 CAS done），不覆盖别人对标题/时间的改动 */
  async toggleItem(
    actor: PlanActor,
    spaceId: number,
    planId: number,
    itemId: number,
    done?: boolean | null,
  ): Promise<PlanItemWriteResult> {
    await this.requireWriter(actor, spaceId)
    await this.loadPlan(spaceId, planId)
    const found = await this.collabRepo.findItemWithPlan(itemId)
    if (!found || found.planId !== planId) throw new SpacePlanNotFoundError('这一块不存在，可能已被其他人删除')
    const result = await this.collabRepo.toggleItemAtomic(
      planId,
      itemId,
      actor.username,
      done === undefined || done === null ? undefined : done === true,
    )
    if (!result.item) throw new SpacePlanNotFoundError('这一块不存在，可能已被其他人删除')
    return { item: result.item, eventId: result.eventId }
  }

  /** 跨天/排序：目标天必须属于同一计划 */
  async moveItem(
    actor: PlanActor,
    spaceId: number,
    planId: number,
    itemId: number,
    input: { dayId?: unknown; sortOrder?: unknown },
  ): Promise<PlanItemWriteResult> {
    await this.requireWriter(actor, spaceId)
    await this.loadPlan(spaceId, planId)
    const dayId = normalizeDayId(input.dayId)
    const day = await this.collabRepo.findDayWithPlan(dayId)
    if (!day || day.planId !== planId) throw new PlanValidationError('目标天不属于这个计划')
    const found = await this.collabRepo.findItemWithPlan(itemId)
    if (!found || found.planId !== planId) throw new SpacePlanNotFoundError('这一块不存在，可能已被其他人删除')
    const result = await this.collabRepo.moveItem(planId, itemId, actor.username, dayId, normalizeSortOrder(input.sortOrder))
    if (!result.item) throw new SpacePlanNotFoundError('这一块不存在，可能已被其他人删除')
    return { item: result.item, eventId: result.eventId }
  }

  // ---------- 事件 / 文档 / 令牌 ----------

  /** 增量事件（SSE 复用同一查询；since = 本地最后收到的 eventId） */
  async listEvents(
    actor: PlanActor,
    spaceId: number,
    planId: number,
    since: number,
    limit = PLAN_EVENT_PAGE_MAX,
  ): Promise<{ events: PlanEventRecord[]; lastEventId: number }> {
    await requireSpaceMember(actor.username, spaceId)
    await this.loadPlan(spaceId, planId)
    const events = await this.collabRepo.listEvents(planId, since, limit)
    const lastEventId = events.length > 0 ? events[events.length - 1].id : await this.collabRepo.lastEventId(planId)
    return { events, lastEventId }
  }

  /** 签发协同 token（5 分钟有效，HMAC） */
  async issueCollabToken(actor: PlanActor, spaceId: number, planId: number): Promise<{
    token: string
    wsUrl: string
    room: string
    expiresIn: number
    exp: number
  }> {
    await this.requireWriter(actor, spaceId)
    await this.loadPlan(spaceId, planId)
    const userId = Number(actor.userId ?? 0)
    if (!Number.isInteger(userId) || userId <= 0) throw new PlanValidationError('当前会话缺少用户标识，无法加入协同编辑')
    const issued = issueCollabToken({ planId, userId })
    return {
      token: issued.token,
      wsUrl: getCollabWsUrl(),
      room: `plan-${planId}`,
      expiresIn: issued.expiresIn,
      exp: issued.exp,
    }
  }

  /** 内部 plan-doc 提交（仅实时服务；鉴权在路由层用 x-collab-secret） */
  async syncPlanDoc(input: PlanDocSyncInput): Promise<PlanDocSyncResult> {
    const plan = await this.planRepo.findById(input.planId)
    if (!plan) throw new SpacePlanNotFoundError()
    return this.collabRepo.syncDoc({ ...input, actor: input.actor ?? 'collab' })
  }

  /** 内部只读：取 Yjs 快照（没有快照字节 → null，路由转 404） */
  async getPlanDoc(planId: number): Promise<{ planId: number; yjsState: string; revision: number; lastEventId: number } | null> {
    const plan = await this.planRepo.findById(planId)
    if (!plan) throw new SpacePlanNotFoundError()
    const doc: SpacePlanDocRecord | null = await this.collabRepo.getDoc(planId)
    if (!doc || !doc.state || doc.state.length === 0) return null
    return {
      planId,
      yjsState: doc.state.toString('base64'),
      revision: doc.revision,
      lastEventId: doc.lastEvent,
    }
  }

  /** mediaIds 归属校验：所有媒体必须存在，且属于当前空间（spaceId 为空的历史媒体放行） */
  private async resolveMediaIds(spaceId: number, value: unknown): Promise<number[]> {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value)) throw new PlanValidationError('照片列表格式不正确')
    const ids: number[] = []
    for (const raw of value) {
      const id = Number(raw)
      if (!Number.isInteger(id) || id <= 0) throw new PlanValidationError('照片 id 不合法')
      if (!ids.includes(id)) ids.push(id)
    }
    if (ids.length > MEDIA_MAX) throw new PlanValidationError(`每块最多 ${MEDIA_MAX} 张照片`)
    if (ids.length === 0) return []
    const rows = await prisma.media.findMany({ where: { id: { in: ids } }, select: { id: true, spaceId: true } })
    if (rows.length !== ids.length) throw new PlanValidationError('有照片不存在或已被删除')
    for (const row of rows) {
      if (row.spaceId != null && row.spaceId !== spaceId) throw new PlanValidationError('不能使用其他空间的照片')
    }
    return ids
  }
}

/** 计划创建时写入 planMeta 的引擎输入（供 space-plan.service 复用） */
export function buildPlanMeta(
  itinerary: PlanEngineItinerary,
  input: {
    departureCity?: string | null
    transportMode?: string | null
    pace?: string | null
    interests?: string[] | null
    travelers?: string[] | null
  },
): PlanMeta {
  return {
    departureCity: input.departureCity?.toString().trim() || null,
    transportMode: input.transportMode ?? null,
    pace: input.pace ?? null,
    interests: Array.isArray(input.interests) ? input.interests : [],
    travelers: Array.isArray(input.travelers) ? input.travelers : [],
    budgetSplit: itinerary.budgetSplit
      ? {
        transport: itinerary.budgetSplit.transport,
        hotel: itinerary.budgetSplit.hotel,
        food: itinerary.budgetSplit.food,
        ticket: itinerary.budgetSplit.ticket,
      }
      : null,
    engineVersion: itinerary.engineVersion,
    generatedAt: new Date().toISOString(),
  }
}

export const spacePlanCollabService = new SpacePlanCollabService()
