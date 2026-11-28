/**
 * Space 旅行计划业务服务（S3）。
 *
 * 产品形态：空间里「一起规划下一次旅行」——
 *   · 计划本身只有基本信息（标题/目的地/起止日期/预算/备注/状态）；
 *   · **共享清单**存在 tasks JSON 里，空间成员可各自勾选（单条 toggle，避免整表覆盖）；
 *   · 「一键转成旅行记录」用计划信息建一条 Travel 草稿（spaceId → 该空间）并回填
 *     convertedTravelId；重复调用幂等（convertedTravelId 即幂等锚点）。
 *
 * 权限（与空间一致，全部走 lib/modules/space/permissions.ts）：
 *   · 列表/详情：OWNER/MEMBER/VIEWER 均可读（VIEWER 只读）；
 *   · 创建/编辑（含勾选清单）/转换：OWNER/MEMBER；
 *   · 删除：空间 OWNER，或计划的发起人（createdById/createdBy）。
 */
import { randomBytes, randomUUID } from 'crypto'
import { prisma } from '../../db'
import { requireSpaceMember, requireSpaceRole, SpaceAccessError } from './permissions'
import { writeAuditLog } from '../audit/audit-log.service'
import { travelService } from '../travel/space-travel.service'
import { prismaTravelRepository } from '../travel/space-travel.repository'
import {
  PrismaSpacePlanRepository,
  prismaSpacePlanRepository,
  parseTasks,
  type PlanMeta,
  type PlanTask,
  type PlanTaskKind,
  type SpacePlanRecord,
  type SpacePlanStatus,
  type UpdatePlanPatch,
} from './space-plan.repository'
import {
  prismaSpacePlanCollabRepository,
  dateToYmd,
  type SpacePlanDayRecord,
  type SpacePlanItemRecord,
} from './space-plan-collab.repository'
import { spacePlanCollabService, buildPlanMeta } from './space-plan-collab.service'
import { SpacePlanNotFoundError } from './space-plan-errors'
import { buildItinerary, type PlanEngineItinerary } from './plan-engine'

const TITLE_MAX = 200
const DEST_MAX = 200
const NOTE_MAX = 5000
const TASKS_MAX = 100
const TASK_TEXT_MAX = 120
const STATUSES: SpacePlanStatus[] = ['PLANNING', 'CONFIRMED', 'DONE']
const TASK_KINDS: PlanTaskKind[] = ['TODO', 'PACK', 'PLACE']

/**
 * 计划不存在 / 不属于该空间 → 404。
 * P1a 起错误类型移到 ./space-plan-errors（协同服务与路由都要用，放这里会成环），
 * 这里保留 re-export 兼容既有 import。
 */
export { SpacePlanNotFoundError }

export interface PlanTaskInput {
  id?: string
  text: string
  kind?: string
  done?: boolean
  doneBy?: string | null
  doneAt?: string | null
}

export interface CreatePlanInput {
  title: string
  destination?: string | null
  startDate?: string | null
  endDate?: string | null
  budget?: number | null
  note?: string | null
  status?: string
  tasks?: PlanTaskInput[]
  // —— P1a 规划引擎输入（可选；给了起止日期才会生成天/块骨架）——
  departureCity?: string | null
  /** FLIGHT / TRAIN / DRIVE / MIXED */
  transportMode?: string | null
  /** RELAXED / STANDARD / PACKED */
  pace?: string | null
  interests?: string[] | null
  travelers?: string[] | null
}

export interface UpdatePlanInput extends Partial<CreatePlanInput> {
  /** 单条勾选（多人共享清单的并发安全路径）：只改这一项，不覆盖别人的改动 */
  toggleTask?: { id: string; done?: boolean }
  /** 计划级乐观锁：带上当前 version，不匹配 → 409 + 当前行 */
  version?: number
  /** 计划封面媒体 id（P2 用） */
  coverMediaId?: number | null
  /** 引擎输入与元信息（一般由创建时写入，PATCH 可整体替换） */
  planMeta?: PlanMeta | null
}

/** 创建计划的结果：计划行 + 引擎生成的天/块（没有日期时为空数组） */
export interface CreatePlanResult {
  plan: SpacePlanRecord
  days: SpacePlanDayRecord[]
  items: SpacePlanItemRecord[]
  docRevision: number
  lastEventId: number
}

export interface PlanActor {
  username: string
  userId?: number | null
}

function toDate(value: string | null | undefined, label: string): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) throw new Error(`${label}格式不正确`)
  return d
}

function normalizeTitle(value: unknown): string {
  const title = String(value ?? '').trim()
  if (!title) throw new Error('计划标题不能为空')
  if (title.length > TITLE_MAX) throw new Error('计划标题最多 200 个字符')
  return title
}

function normalizeBudget(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw new Error('预算需为不小于 0 的数字')
  if (n > 100_000_000) throw new Error('预算数值过大')
  return Math.round(n * 100) / 100
}

function normalizeStatus(value: unknown): SpacePlanStatus {
  if (value === undefined) return 'PLANNING'
  if (!STATUSES.includes(value as SpacePlanStatus)) throw new Error('计划状态不合法')
  return value as SpacePlanStatus
}

/** 清单归一化：补 id、裁剪文案、去重、限长；done 状态的 audit 字段由调用方补齐 */
export function normalizeTasks(input: unknown, actor?: string): PlanTask[] {
  if (input === undefined) return []
  if (!Array.isArray(input)) throw new Error('清单格式不正确')
  if (input.length > TASKS_MAX) throw new Error('清单最多 100 项')
  const out: PlanTask[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    const row = (raw ?? {}) as Record<string, unknown>
    const text = String(row.text ?? '').trim()
    if (!text) continue
    if (text.length > TASK_TEXT_MAX) throw new Error('清单项最多 120 个字符')
    const kind = TASK_KINDS.includes(row.kind as PlanTaskKind) ? (row.kind as PlanTaskKind) : 'TODO'
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim().slice(0, 64) : `t-${randomUUID()}`
    if (seen.has(id)) continue
    seen.add(id)
    const done = row.done === true
    out.push({
      id,
      text,
      kind,
      done,
      doneBy: done ? (typeof row.doneBy === 'string' ? row.doneBy : actor ?? null) : null,
      doneAt: done ? (typeof row.doneAt === 'string' ? row.doneAt : new Date().toISOString()) : null,
    })
  }
  return out
}

/** 空间类型 → 旅行类型（转成旅行记录时的默认值） */
function travelTypeOfSpace(spaceType?: string | null): 'ALONE' | 'COUPLE' | 'FAMILY' | 'FRIENDS' | 'BFF' | 'GROUP' | 'OTHER' {
  switch (spaceType) {
    case 'COUPLE':
      return 'COUPLE'
    case 'FAMILY':
      return 'FAMILY'
    case 'FRIENDS':
      return 'FRIENDS'
    case 'SOLO':
      return 'ALONE'
    default:
      return 'ALONE'
  }
}

/**
 * 由计划标题派生旅行 slug（Travel 的 slug 只允许 [a-z0-9-]{2,80}）。
 * 中文标题派生为空 → 回退 `plan-<id>`（稳定、可读、URL 安全）。
 */
function asciiSlugBase(title: string, planId: number): string {
  const base = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return base.length >= 2 ? base : `plan-${planId}`
}

export class SpacePlanService {
  constructor(private readonly repo: PrismaSpacePlanRepository) {}

  private async loadPlan(spaceId: number, planId: number): Promise<SpacePlanRecord> {
    const plan = await this.repo.findById(planId)
    // 跨空间访问按「不存在」处理（IDOR 防护：不告诉调用方这个 id 在别的空间里）
    if (!plan || plan.spaceId !== spaceId) throw new SpacePlanNotFoundError()
    return plan
  }

  /** 列表（含清单完成数）：空间成员均可读 */
  async listPlans(actor: string, spaceId: number): Promise<SpacePlanRecord[]> {
    await requireSpaceMember(actor, spaceId)
    return this.repo.listForSpace(spaceId)
  }

  /** 详情：空间成员均可读 */
  async getPlan(actor: string, spaceId: number, planId: number): Promise<SpacePlanRecord> {
    await requireSpaceMember(actor, spaceId)
    return this.loadPlan(spaceId, planId)
  }

  /**
   * 发起计划：OWNER/MEMBER。
   *
   * P1a 起「有起止日期」会在创建时调用规划引擎（纯函数）生成天/块骨架，
   * 并把引擎输入写进 planMeta；没有日期则只建计划行（days 为空，等用户自己补）。
   * 骨架写入失败会补偿删除计划行，避免留下「半截计划」。
   */
  async createPlan(actor: PlanActor, spaceId: number, input: CreatePlanInput): Promise<CreatePlanResult> {
    await requireSpaceRole(actor.username, spaceId, ['OWNER', 'MEMBER'])

    const title = normalizeTitle(input.title)
    const destination = input.destination == null ? null : String(input.destination).trim().slice(0, DEST_MAX) || null
    const note = input.note == null ? null : String(input.note).trim().slice(0, NOTE_MAX) || null
    const startDate = toDate(input.startDate, '开始日期') ?? null
    const endDate = toDate(input.endDate, '结束日期') ?? null
    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      throw new Error('结束日期不能早于开始日期')
    }
    const budget = normalizeBudget(input.budget)

    // 引擎是纯函数：先算骨架（出错时计划行还没建，天然无脏数据）
    let itinerary: PlanEngineItinerary | null = null
    if (startDate && endDate) {
      itinerary = buildItinerary({
        destination: destination || title,
        departureCity: input.departureCity ?? null,
        startDate: dateToYmd(startDate) || '',
        endDate: dateToYmd(endDate) || '',
        transportMode: input.transportMode ?? null,
        pace: input.pace ?? null,
        interests: input.interests ?? null,
        travelers: input.travelers ?? null,
        budget,
      })
    }

    const id = await this.repo.create({
      spaceId,
      title,
      destination,
      startDate,
      endDate,
      budget,
      note,
      status: normalizeStatus(input.status),
      tasks: normalizeTasks(input.tasks, actor.username),
      planMeta: itinerary ? buildPlanMeta(itinerary, input) : null,
      createdById: actor.userId ?? null,
      createdBy: actor.username,
    })

    let days: SpacePlanDayRecord[] = []
    let lastEventId = 0
    if (itinerary) {
      try {
        const skeleton = await prismaSpacePlanCollabRepository.createSkeleton(id, itinerary, actor.username)
        days = skeleton.days
        lastEventId = skeleton.eventId
      } catch (error) {
        // 补偿：骨架写失败就删掉刚建的计划行（天/块同事务，不会残留）
        await this.repo.remove(id).catch(() => {})
        throw error
      }
    }

    await writeAuditLog({
      username: actor.username,
      action: 'CREATE',
      resourceType: 'SpaceTravelPlan',
      resourceId: String(id),
      spaceId,
      metadata: {
        title,
        destination,
        ...(itinerary ? { dayCount: itinerary.dayCount, engineVersion: itinerary.engineVersion } : {}),
      },
    }).catch(() => {})

    const plan = await this.loadPlan(spaceId, id)
    return {
      plan,
      days,
      items: days.flatMap((day) => day.items),
      docRevision: plan.docRevision,
      lastEventId,
    }
  }

  /** 编辑信息 / 整表替换清单 / 单条勾选：OWNER/MEMBER（共享清单需要成员都能勾） */
  async updatePlan(actor: PlanActor, spaceId: number, planId: number, input: UpdatePlanInput): Promise<SpacePlanRecord> {
    await requireSpaceRole(actor.username, spaceId, ['OWNER', 'MEMBER'])
    const current = await this.loadPlan(spaceId, planId)

    const patch: UpdatePlanPatch = {}

    if (input.title !== undefined) patch.title = normalizeTitle(input.title)
    if (input.destination !== undefined) {
      patch.destination = input.destination == null ? null : String(input.destination).trim().slice(0, DEST_MAX) || null
    }
    if (input.note !== undefined) {
      patch.note = input.note == null ? null : String(input.note).trim().slice(0, NOTE_MAX) || null
    }
    const startDate = toDate(input.startDate, '开始日期')
    if (startDate !== undefined) patch.startDate = startDate
    const endDate = toDate(input.endDate, '结束日期')
    if (endDate !== undefined) patch.endDate = endDate
    if (input.budget !== undefined) patch.budget = normalizeBudget(input.budget)
    if (input.status !== undefined) patch.status = normalizeStatus(input.status)

    // 清单：优先处理单条勾选（并发安全），否则整表替换
    if (input.toggleTask) {
      const taskId = String(input.toggleTask.id || '').trim()
      if (!taskId) throw new Error('缺少清单项 id')
      const tasks = current.tasks.map((t) => ({ ...t }))
      const target = tasks.find((t) => t.id === taskId)
      if (!target) throw new Error('清单项不存在，可能已被其他人删除')
      const nextDone = input.toggleTask.done === undefined ? !target.done : input.toggleTask.done === true
      target.done = nextDone
      target.doneBy = nextDone ? actor.username : null
      target.doneAt = nextDone ? new Date().toISOString() : null
      patch.tasks = tasks
    } else if (input.tasks !== undefined) {
      // 整表替换时保留原有项的勾选状态（只按 id 对齐），避免别人的勾选被新列表覆盖掉
      const incoming = normalizeTasks(input.tasks, actor.username)
      const prev = new Map(current.tasks.map((t) => [t.id, t]))
      patch.tasks = incoming.map((t) => {
        const old = prev.get(t.id)
        return old ? { ...t, done: old.done, doneBy: old.doneBy, doneAt: old.doneAt } : t
      })
    }

    // 日期跨字段校验要拿「改后」的值来比
    const nextStart = patch.startDate !== undefined ? patch.startDate : (current.startDate ? new Date(current.startDate) : null)
    const nextEnd = patch.endDate !== undefined ? patch.endDate : (current.endDate ? new Date(current.endDate) : null)
    if (nextStart && nextEnd && nextEnd.getTime() < nextStart.getTime()) {
      throw new Error('结束日期不能早于开始日期')
    }

    // P1a：计划封面 / 引擎元信息（一般由创建时写入，PATCH 可整体替换）
    if (input.coverMediaId !== undefined) patch.coverMediaId = input.coverMediaId
    if (input.planMeta !== undefined) patch.planMeta = input.planMeta

    if (Object.keys(patch).length === 0) throw new Error('没有需要更新的内容')

    // 计划级乐观锁：带 version 走 CAS（不匹配 → 409 + 当前行）；不带则保持老客户端行为
    let expectedVersion: number | null = null
    if (input.version !== undefined) {
      const value = Number(input.version)
      if (!Number.isInteger(value) || value < 0) throw new Error('version 不合法')
      expectedVersion = value
    }
    await spacePlanCollabService.patchPlan(actor, spaceId, planId, patch, expectedVersion)

    await writeAuditLog({
      username: actor.username,
      action: 'UPDATE',
      resourceType: 'SpaceTravelPlan',
      resourceId: String(planId),
      spaceId,
      metadata: {
        fields: Object.keys(patch),
        ...(expectedVersion != null ? { version: expectedVersion } : {}),
        ...(input.toggleTask ? { toggleTask: input.toggleTask } : {}),
      },
    }).catch(() => {})

    return this.loadPlan(spaceId, planId)
  }

  /** 删除：空间 OWNER，或计划发起人 */
  async deletePlan(actor: PlanActor, spaceId: number, planId: number): Promise<void> {
    const access = await requireSpaceMember(actor.username, spaceId)
    const plan = await this.loadPlan(spaceId, planId)
    if (!access.isOwner) {
      const byId = plan.createdById != null && actor.userId != null && plan.createdById === actor.userId
      const byName = plan.createdBy != null && plan.createdBy === actor.username
      if (!byId && !byName) {
        throw new SpaceAccessError('只有空间主人或计划发起人可以删除该计划')
      }
    }
    await this.repo.remove(planId)
    await writeAuditLog({
      username: actor.username,
      action: 'DELETE',
      resourceType: 'SpaceTravelPlan',
      resourceId: String(planId),
      spaceId,
      metadata: { title: plan.title },
    }).catch(() => {})
  }

  /**
   * 一键转成旅行记录：用计划信息建 Travel 草稿（spaceId 关联该空间）。
   *
   * 幂等：convertedTravelId 已存在时直接返回那条旅行（alreadyConverted=true），
   * 不会重复建；若目标旅行已被删除（FK ON DELETE SET NULL 已把字段清空），
   * 则会正常重建一条。
   */
  async convertPlan(
    actor: PlanActor,
    spaceId: number,
    planId: number,
  ): Promise<{ travelId: number; travelSlug: string; alreadyConverted: boolean; plan: SpacePlanRecord }> {
    await requireSpaceRole(actor.username, spaceId, ['OWNER', 'MEMBER'])
    const plan = await this.loadPlan(spaceId, planId)

    if (plan.convertedTravelId != null) {
      const existing = await prisma.travel.findUnique({
        where: { id: plan.convertedTravelId },
        select: { id: true, slug: true },
      })
      if (existing) {
        return { travelId: existing.id, travelSlug: existing.slug, alreadyConverted: true, plan }
      }
    }

    const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { spaceType: true } })
    const base = asciiSlugBase(plan.title, plan.id)
    let slug = base
    for (let i = 0; i < 20; i++) {
      const candidate = i === 0 ? base : `${base.slice(0, 70)}-${i + 1}`
      if (!(await prismaTravelRepository.slugExists(spaceId, candidate))) {
        slug = candidate
        break
      }
    }
    if (await prismaTravelRepository.slugExists(spaceId, slug)) {
      slug = `${base.slice(0, 70)}-${randomBytes(2).toString('hex')}`
    }

    const created = await travelService.createTravel(actor.username, {
      spaceId,
      title: plan.title,
      slug,
      description: plan.note ?? null,
      startDate: plan.startDate,
      endDate: plan.endDate,
      status: 'PLANNED',
      visibility: 'SPACE',
      travelType: travelTypeOfSpace(space?.spaceType),
    })

    try {
      // 预算不在 createTravel 的入参里（那是既有服务的稳定契约），单独回填
      if (plan.budget != null) {
        await prisma.travel.update({
          where: { id: created.id },
          data: { budget: plan.budget },
          select: { id: true },
        })
      }
      await this.repo.update(planId, { convertedTravelId: created.id })
    } catch (error) {
      // 补偿：回填失败就把刚建的草稿删掉，避免留下「没有任何计划引用」的孤儿旅行
      console.error('[space-plan] 转换回填失败，回滚旅行草稿:', (error as Error)?.message)
      await travelService.deleteTravel(actor.username, created.id).catch(() => {})
      throw new Error('转换失败，请重试')
    }

    await writeAuditLog({
      username: actor.username,
      action: 'CREATE',
      resourceType: 'Travel',
      resourceId: String(created.id),
      spaceId,
      metadata: { fromPlanId: planId, planTitle: plan.title },
    }).catch(() => {})

    const updated = await this.loadPlan(spaceId, planId)
    return { travelId: created.id, travelSlug: slug, alreadyConverted: false, plan: updated }
  }
}

export const spacePlanService = new SpacePlanService(prismaSpacePlanRepository)

/** 供测试/脚本直接复用（与 service 内一致的清洗规则） */
export { parseTasks }
export type { PlanTask, PlanTaskKind, SpacePlanRecord, SpacePlanStatus }