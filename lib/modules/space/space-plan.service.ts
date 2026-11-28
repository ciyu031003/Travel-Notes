/**
 * Space 旅行计划业务服务（S3）。
 *
 * 产品形态：空间里「一起规划下一次旅行」——
 *   · 计划本身只有基本信息（标题/目的地/起止日期/预算/备注/状态）；
 *   · **共享清单**存在 tasks JSON 里，空间成员可各自勾选（单条 toggle，避免整表覆盖）；
 *   · 「一键转成旅行记录」（P3）把计划**整棵结构**搬成旅行记录：天 → TravelDay、
 *     块 → ItineraryItem、块级照片 → 按天 Memory，并回填 convertedTravelId；
 *     重复调用幂等（convertedTravelId 即幂等锚点），全程一个事务；
 *   · 转换时可选「同时公开到旅行圈」（publish=true → visibility=PUBLIC + TravelPost 投影）。
 *
 * 权限（与空间一致，全部走 lib/modules/space/permissions.ts）：
 *   · 列表/详情：OWNER/MEMBER/VIEWER 均可读（VIEWER 只读）；
 *   · 创建/编辑（含勾选清单）/转换：OWNER/MEMBER；
 *   · 删除：空间 OWNER，或计划的发起人（createdById/createdBy）。
 */
import { randomBytes, randomUUID } from 'crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db'
import { requireSpaceMember, requireSpaceRole, SpaceAccessError } from './permissions'
import { writeAuditLog } from '../audit/audit-log.service'
import { syncTravelPost } from '../social/travel-post.service'
import { prismaTravelRepository } from '../travel/space-travel.repository'
import { planTravelDayDates } from '../travel/travel.policy'
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
  dayDateToYmd,
  toIsoOrNull,
  type SpacePlanDayRecord,
  type SpacePlanItemRecord,
} from './space-plan-collab.repository'
import { spacePlanCollabService, buildPlanMeta } from './space-plan-collab.service'
import { SpacePlanNotFoundError } from './space-plan-errors'
import { buildItinerary, type PlanEngineItinerary, type PlanItemKind } from './plan-engine'

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

// ============================================================
// 转换映射（纯函数，可单测）
// ============================================================

/**
 * 计划块类型 → 旅行行程项类型。
 *
 * Travel 侧 ItineraryItem.type 只有 SPOT/FOOD/HOTEL/TRANSPORT/ACTIVITY 五档
 * （见 lib/mobile/icon-system.ts），计划侧的 FLEX（机动 / 自由活动）没有独立档位，
 * 归到 ACTIVITY —— 宁可显示成"自由活动"，也不要丢掉这一块。
 */
export type TravelItineraryType = 'TRANSPORT' | 'HOTEL' | 'FOOD' | 'SPOT' | 'ACTIVITY'

export const PLAN_ITEM_KIND_TO_TRAVEL_TYPE: Record<PlanItemKind, TravelItineraryType> = {
  TRANSPORT: 'TRANSPORT',
  HOTEL: 'HOTEL',
  FOOD: 'FOOD',
  SPOT: 'SPOT',
  ACTIVITY: 'ACTIVITY',
  FLEX: 'ACTIVITY',
}

const PLAN_ITEM_KINDS: PlanItemKind[] = ['TRANSPORT', 'HOTEL', 'FOOD', 'SPOT', 'ACTIVITY', 'FLEX']

/** 计划块 kind 归一化：脏值/大小写/未知类型一律按 SPOT（与 P1 物化口径一致） */
export function normalizePlanItemKind(value: unknown): PlanItemKind {
  const kind = String(value ?? '').trim().toUpperCase() as PlanItemKind
  return PLAN_ITEM_KINDS.includes(kind) ? kind : 'SPOT'
}

/** 转换输入：一块（与 SpacePlanItem 行同构，时间/照片已拍平成纯值，便于单测） */
export interface ConvertiblePlanItem {
  kind: string | null
  title: string
  /** 墙上时间的 ISO 串（UTC 字段即墙上时间，见 space-plan-collab.repository 约定） */
  startAt: string | null
  endAt: string | null
  place: string | null
  costCents: number | null
  note: string | null
  sortOrder: number
  mediaIds: number[]
}

/** 转换输入：一天 */
export interface ConvertiblePlanDay {
  /** 'YYYY-MM-DD'（null = 还没排日期） */
  date: string | null
  title: string | null
  theme: string | null
  summary: string | null
  sortOrder: number
  items: ConvertiblePlanItem[]
}

/** 转换输出：要写的 TravelDay + 它的行程项 + 可选的当天回忆 */
export interface ConvertedTravelDay {
  date: Date | null
  title: string | null
  summary: string | null
  sortOrder: number
  items: ConvertedItineraryItem[]
  /** 只有「有照片」或「有备注」才建；否则 null（不建空回忆） */
  memory: { title: string; content: string | null; mediaIds: number[] } | null
}

export interface ConvertedItineraryItem {
  type: TravelItineraryType
  title: string
  startTime: Date | null
  endTime: Date | null
  notes: string | null
  sortOrder: number
}

/** 'YYYY-MM-DD' → 本地零点 Date（与 TravelDay.date 的既有约定一致；非法/空 → null） */
export function planYmdToLocalDate(ymd: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? '').trim().slice(0, 10))
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * 「天日期 + 块的墙上时间」→ ItineraryItem.startTime/endTime。
 *
 * 计划块的 startAt/endAt 是**墙上时间**（引擎写 'YYYY-MM-DDTHH:mm'，落库用 Date.UTC，
 * 读回 getUTC* 即墙上时间）；ItineraryItem 的时间是同一条历史约定。
 * 所以这里取「块的时分秒」+「当天的年月日」重组，而不是直接搬 ISO：
 *   · 块只填了时间（1970 基准日）也能落到正确的那一天；
 *   · 计划天的日期被改过时，块时间跟着天走，不会漂到前一天/后一天。
 */
export function combinePlanDayAndTime(dayYmd: string | null, value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const wall = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(wall.getTime())) return null
  const hours = wall.getUTCHours()
  const minutes = wall.getUTCMinutes()
  const seconds = wall.getUTCSeconds()
  const dayDate = planYmdToLocalDate(dayYmd)
  if (!dayDate) {
    // 天没排日期：块自带真实年月日（>= 2000）就保留原值，1970 基准日的时间串丢弃
    return wall.getUTCFullYear() >= 2000 ? wall : null
  }
  return new Date(Date.UTC(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), hours, minutes, seconds))
}

/** 分 → 元的展示串（整数不带小数，避免"¥146.00"这种噪声） */
function formatYuan(cents: number): string {
  const yuan = cents / 100
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2)
}

/**
 * 块的「地点 / 花销 / 备注」压成 ItineraryItem.notes。
 *
 * ItineraryItem 没有 place/cost 列，直接丢会把用户填的"住哪、花了多少"抹掉；
 * 拼进 notes 既保留信息，也不用改既有数据模型。
 */
export function composeItineraryNotes(item: ConvertiblePlanItem): string | null {
  const parts: string[] = []
  const note = (item.note ?? '').trim()
  if (note) parts.push(note)
  const place = (item.place ?? '').trim()
  if (place) parts.push(`地点：${place}`)
  if (typeof item.costCents === 'number' && item.costCents > 0) parts.push(`预算：¥${formatYuan(item.costCents)}`)
  return parts.length > 0 ? parts.join('\n') : null
}

/** 计划里没有天骨架（老计划 / 只填了日期）→ 按旅行区间补出空天，至少让旅行有分天结构 */
function daysFromPlanRange(plan: { startDate: string | null; endDate: string | null }): ConvertiblePlanDay[] {
  if (!plan.startDate) return []
  return planTravelDayDates(plan.startDate, plan.endDate).map((date, index) => ({
    date: dayDateToYmd(date),
    title: null,
    theme: null,
    summary: null,
    sortOrder: index,
    items: [],
  }))
}

/**
 * 计划的天 → 待写入的 TravelDay 列表（纯函数，转换的核心规则都在这里）。
 *
 * 规则：
 *   · 块按其 sortOrder 排序后重新编号（0..n-1），天也重新编号，前端无需再排；
 *   · kind 走 PLAN_ITEM_KIND_TO_TRAVEL_TYPE；FLEX → ACTIVITY；
 *   · 时间 = 天日期 + 块的墙上时分秒（见 combinePlanDayAndTime）；
 *   · 空天跳过：没有日期、没有标题/备注、也没有块的"天"建出来只是一行空壳；
 *   · 回忆：当天有块级照片或有备注（summary）才建，标题回退「第 N 天」。
 */
export function buildConvertedTravelDays(
  plan: { startDate: string | null; endDate: string | null },
  days: ConvertiblePlanDay[],
): ConvertedTravelDay[] {
  const source = days.length > 0 ? days : daysFromPlanRange(plan)
  const out: ConvertedTravelDay[] = []

  for (const day of source) {
    const ymd = day.date ? String(day.date).trim().slice(0, 10) || null : null
    const items: ConvertedItineraryItem[] = [...(day.items ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item, index) => ({
        type: PLAN_ITEM_KIND_TO_TRAVEL_TYPE[normalizePlanItemKind(item.kind)],
        title: (item.title ?? '').trim().slice(0, 255) || '待定',
        startTime: combinePlanDayAndTime(ymd, item.startAt),
        endTime: combinePlanDayAndTime(ymd, item.endAt),
        notes: composeItineraryNotes(item),
        sortOrder: index,
      }))

    const title = day.title?.trim() || null
    const summary = day.summary?.trim() || null
    if (!ymd && !title && !summary && items.length === 0) continue

    const mediaIds = Array.from(new Set((day.items ?? []).flatMap((item) => item.mediaIds ?? [])))
    const memory = mediaIds.length > 0 || summary
      ? { title: title || `第 ${out.length + 1} 天`, content: summary, mediaIds }
      : null

    out.push({
      date: planYmdToLocalDate(ymd),
      title,
      summary,
      sortOrder: out.length,
      items,
      memory,
    })
  }

  return out
}

/**
 * 转换时读的天/块/照片列。
 * `satisfies` 让 prisma 的类型推导精确，避免手写行类型与 schema 漂移。
 */
const PLAN_DAY_CONVERT_SELECT = {
  id: true,
  date: true,
  title: true,
  theme: true,
  summary: true,
  sortOrder: true,
  items: {
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      kind: true,
      startAt: true,
      endAt: true,
      title: true,
      place: true,
      costCents: true,
      note: true,
      sortOrder: true,
      media: { orderBy: { sortOrder: 'asc' }, select: { mediaId: true } },
    },
  },
} satisfies Prisma.SpacePlanDaySelect

type PlanDayConvertRow = Prisma.SpacePlanDayGetPayload<{ select: typeof PLAN_DAY_CONVERT_SELECT }>

/** prisma 行 → 纯值（时间统一成 ISO，交给纯函数组合日期） */
function toConvertiblePlanDay(row: PlanDayConvertRow): ConvertiblePlanDay {
  return {
    date: dayDateToYmd(row.date),
    title: row.title,
    theme: row.theme,
    summary: row.summary,
    sortOrder: row.sortOrder,
    items: row.items.map((item) => ({
      kind: String(item.kind),
      title: item.title,
      startAt: toIsoOrNull(item.startAt),
      endAt: toIsoOrNull(item.endAt),
      place: item.place,
      costCents: item.costCents,
      note: item.note,
      sortOrder: item.sortOrder,
      mediaIds: item.media.map((link) => link.mediaId),
    })),
  }
}

/** 转换选项：publish=true 时同时公开到旅行圈（默认 false，隐私优先） */
export interface ConvertPlanOptions {
  publish?: boolean
}

/** 转换结果（P3 起多了 published；其余字段与 P1 向后兼容） */
export interface ConvertPlanResult {
  travelId: number
  travelSlug: string
  alreadyConverted: boolean
  /** 这条旅行当前是否已进入旅行圈（本次 publish 或此前已经公开） */
  published: boolean
  plan: SpacePlanRecord
}

/** 并发转换竞争：另一个请求先回填了 convertedTravelId → 回滚后复用对方结果 */
class PlanConversionRaceError extends Error {
  constructor() {
    super('该计划已被另一个请求转换为旅行记录')
    this.name = 'PlanConversionRaceError'
  }
}

/** 幂等查询：转换目标旅行（含它是否已进入旅行圈） */
async function findConvertedTravel(travelId: number) {
  return prisma.travel.findUnique({
    where: { id: travelId },
    select: { id: true, slug: true, visibility: true, travelPost: { select: { id: true } } },
  })
}

// ============================================================
// 计划生成的回忆：可见性随旅行公开 / 取消公开同步
// ============================================================

/** 计划转换事件的动作名（SpacePlanEvent；payload 里记 memoryIds = 转换生成的回忆） */
export const PLAN_CONVERT_EVENT_ACTION = 'plan.convert'

/** 回忆可见性（与 Travel.visibility 同三档） */
export type MemoryVisibility = 'PUBLIC' | 'SPACE' | 'PRIVATE'

/** 从事件 payload 里解析 memoryIds（适配器 jsonStrings=true：payload 可能是字符串） */
export function parseConvertedMemoryIds(payload: unknown): number[] {
  let value: unknown = payload
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!value || typeof value !== 'object') return []
  const raw = (value as { memoryIds?: unknown }).memoryIds
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const item of raw) {
    const id = Number(item)
    if (Number.isInteger(id) && id > 0 && !out.includes(id)) out.push(id)
  }
  return out.slice(0, 500)
}

type DbClient = Prisma.TransactionClient | typeof prisma

/** 读「这条计划转换时生成了哪些回忆」（最新一次 plan.convert 事件） */
async function loadConvertedMemoryIds(planId: number, db: DbClient = prisma): Promise<number[]> {
  try {
    const event = await db.spacePlanEvent.findFirst({
      where: { planId, action: PLAN_CONVERT_EVENT_ACTION },
      orderBy: { id: 'desc' },
      select: { payload: true },
    })
    return parseConvertedMemoryIds(event?.payload)
  } catch (error) {
    // 事件只是「来源标记」：读不到就当没有（不影响公开本身，只是不同步回忆）
    console.error('[space-plan] 读取转换事件失败:', (error as Error)?.message)
    return []
  }
}

/**
 * 同步「由计划转换生成的回忆」的可见性（公开 / 取消公开时调用）。
 *
 * 边界（产品要求）：**只动 convert 事务里建的这批**——ids 来自 plan.convert 事件，
 * 并用 travelId 再兜一次底（防止回忆被挪到别的旅行后误改）；用户手工建的回忆一律不受影响。
 * 返回实际被更新的回忆条数（没有转换来源 / 已删除 → 0）。
 */
export async function syncConvertedTravelMemoryVisibility(
  travelId: number,
  visibility: MemoryVisibility,
  db: DbClient = prisma,
): Promise<number> {
  const plan = await db.spaceTravelPlan.findUnique({
    where: { convertedTravelId: travelId },
    select: { id: true },
  })
  if (!plan) return 0
  const memoryIds = await loadConvertedMemoryIds(plan.id, db)
  if (memoryIds.length === 0) return 0
  const result = await db.memory.updateMany({
    where: { id: { in: memoryIds }, travelId },
    data: { visibility },
  })
  return result.count
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
   * 一键转成旅行记录（P3：深度转换）。
   *
   * 与 P1 的「只建一条空壳 Travel」不同，这里把计划的**结构**整棵搬过去：
   *   · 每个 SpacePlanDay → TravelDay（date/title/summary/sortOrder）；
   *   · 每个 SpacePlanItem → ItineraryItem（kind→type、天日期+startAt/endAt 组合墙上时间、title/notes）；
   *   · 块级照片（SpacePlanItemMedia）→ 按天建一条 Memory（**无照片且无备注的天不建空回忆**）；
   *   · 计划信息（标题/目的地/日期/预算/备注/封面/空间类型）落到 Travel。
   *
   * 幂等：convertedTravelId 是幂等锚点 —— 已转换直接返回（alreadyConverted=true）。
   * 回填用 `WHERE convertedTravelId IS NULL` 的 CAS：并发重复点击只会留下一条旅行，
   * 竞争失败方回滚后复用对方的结果。
   *
   * 全程一个事务：任一步失败整体回滚，绝不会留下「半本旅行」（P1 老实现是建完再补偿删除）。
   * `publish=true` 时同事务把 visibility 置 PUBLIC 并写 TravelPost 投影，旅行立刻出现在旅行圈。
   */
  async convertPlan(
    actor: PlanActor,
    spaceId: number,
    planId: number,
    options: ConvertPlanOptions = {},
  ): Promise<ConvertPlanResult> {
    await requireSpaceRole(actor.username, spaceId, ['OWNER', 'MEMBER'])
    const publish = options.publish === true
    const plan = await this.loadPlan(spaceId, planId)

    // —— 幂等：已转换过（且目标旅行还在）→ 直接复用，不重复建天/块 ——
    if (plan.convertedTravelId != null) {
      const existing = await findConvertedTravel(plan.convertedTravelId)
      if (existing) {
        const published = publish
          ? await this.publishConvertedTravel(existing.id)
          : existing.visibility === 'PUBLIC' || existing.travelPost != null
        return {
          travelId: existing.id,
          travelSlug: existing.slug,
          alreadyConverted: true,
          published,
          plan: await this.loadPlan(spaceId, planId),
        }
      }
      // 目标旅行已被删除（FK ON DELETE SET NULL 理论上会清字段，这里兜底重建）
    }

    const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { spaceType: true } })
    const slug = await this.resolveTravelSlug(spaceId, plan.title, plan.id)

    let created: { travelId: number; published: boolean }
    try {
      created = await prisma.$transaction(
        async (tx) => {
          const dayRows = await tx.spacePlanDay.findMany({
            where: { planId },
            orderBy: { sortOrder: 'asc' },
            select: PLAN_DAY_CONVERT_SELECT,
          })
          const days = buildConvertedTravelDays(
            { startDate: plan.startDate, endDate: plan.endDate },
            dayRows.map(toConvertiblePlanDay),
          )

          // 计划封面在计划表上没有外键，可能指向已删除的媒体；
          // 失效就不带过去（否则 Travel.coverMediaId 的 FK 会让整次转换失败）
          const coverMedia =
            plan.coverMediaId != null
              ? await tx.media.findUnique({ where: { id: plan.coverMediaId }, select: { id: true } })
              : null

          const travel = await tx.travel.create({
            data: {
              spaceId,
              // 作者归属转换发起人：旅行圈的帖子作者跟"是谁把计划变成记录"一致
              ownerId: actor.userId ?? null,
              title: plan.title,
              slug,
              description: plan.note ?? null,
              location: plan.destination ?? null,
              startDate: plan.startDate ? new Date(plan.startDate) : null,
              endDate: plan.endDate ? new Date(plan.endDate) : null,
              status: 'PLANNED',
              // 默认留在空间内（隐私优先）；只有显式勾选「同时公开到旅行圈」才 PUBLIC
              visibility: publish ? 'PUBLIC' : 'SPACE',
              isPublic: publish,
              travelType: travelTypeOfSpace(space?.spaceType),
              budget: plan.budget ?? null,
              coverMediaId: coverMedia?.id ?? null,
            },
            select: { id: true },
          })

          // 转换生成的回忆 id：写进 plan.convert 事件，之后公开/取消公开时据此同步可见性
          const convertedMemoryIds: number[] = []
          let convertedItemCount = 0

          for (const day of days) {
            const travelDay = await tx.travelDay.create({
              data: {
                travelId: travel.id,
                date: day.date,
                title: day.title,
                summary: day.summary,
                sortOrder: day.sortOrder,
              },
              select: { id: true },
            })
            for (const item of day.items) {
              await tx.itineraryItem.create({
                data: {
                  travelDayId: travelDay.id,
                  type: item.type,
                  title: item.title,
                  startTime: item.startTime,
                  endTime: item.endTime,
                  notes: item.notes,
                  sortOrder: item.sortOrder,
                },
                select: { id: true },
              })
              convertedItemCount += 1
            }
            if (day.memory) {
              const memory = await tx.memory.create({
                data: {
                  spaceId,
                  travelId: travel.id,
                  travelDayId: travelDay.id,
                  title: day.memory.title,
                  content: day.memory.content,
                  happenedAt: day.date,
                  // 与旅行同档：勾选「同时公开到旅行圈」时回忆（含照片）也随文章可见
                  visibility: publish ? 'PUBLIC' : 'SPACE',
                  createdBy: actor.username,
                  createdById: actor.userId ?? null,
                },
                select: { id: true },
              })
              convertedMemoryIds.push(memory.id)
              if (day.memory.mediaIds.length > 0) {
                await tx.memoryMedia.createMany({
                  data: day.memory.mediaIds.map((mediaId, index) => ({
                    memoryId: memory.id,
                    mediaId,
                    sortOrder: index,
                  })),
                })
              }
            }
          }

          // CAS 回填：只有「还没被别的请求转换过」才成功；
          // 否则抛错让整本旅行回滚（并发重复点击不产生第二本）
          const linked = await tx.spaceTravelPlan.updateMany({
            where: { id: planId, convertedTravelId: null },
            data: { convertedTravelId: travel.id },
          })
          if (linked.count === 0) throw new PlanConversionRaceError()

          let published = false
          if (publish) {
            // 与 travel.service 同口径：TravelPost 是 visibility 的投影，失败即回滚
            const post = await syncTravelPost(travel.id, tx)
            published = post?.published === true
          }

          // 记下「这次转换生成了哪些回忆」：公开开关之后还要按同一规则同步可见性
          // （payload 走 JSON 列，适配器读出可能是字符串，见 parseConvertedMemoryIds）
          await prismaSpacePlanCollabRepository.appendEvent(
            tx,
            planId,
            actor.username,
            PLAN_CONVERT_EVENT_ACTION,
            {
              travelId: travel.id,
              travelSlug: slug,
              published,
              dayCount: days.length,
              itemCount: convertedItemCount,
              memoryIds: convertedMemoryIds,
            },
          )

          return { travelId: travel.id, published }
        },
        { timeout: 20_000 },
      )
    } catch (error) {
      if (error instanceof PlanConversionRaceError) {
        // 别人先完成转换：返回他那本（幂等语义不变），不留孤儿
        const fresh = await this.loadPlan(spaceId, planId)
        if (fresh.convertedTravelId != null) {
          const existing = await findConvertedTravel(fresh.convertedTravelId)
          if (existing) {
            const published = publish
              ? await this.publishConvertedTravel(existing.id)
              : existing.visibility === 'PUBLIC' || existing.travelPost != null
            return {
              travelId: existing.id,
              travelSlug: existing.slug,
              alreadyConverted: true,
              published,
              plan: fresh,
            }
          }
        }
      }
      console.error('[space-plan] 转换旅行记录失败（事务已回滚）:', (error as Error)?.message)
      throw new Error('转换失败，请重试')
    }

    await writeAuditLog({
      username: actor.username,
      action: 'CREATE',
      resourceType: 'Travel',
      resourceId: String(created.travelId),
      spaceId,
      metadata: { fromPlanId: planId, planTitle: plan.title, published: created.published },
    }).catch(() => {})

    return {
      travelId: created.travelId,
      travelSlug: slug,
      alreadyConverted: false,
      published: created.published,
      plan: await this.loadPlan(spaceId, planId),
    }
  }

  /** 计划标题 → 空间内唯一的旅行 slug（沿用 P1 规则：ASCII 派生失败回退 plan-<id>） */
  private async resolveTravelSlug(spaceId: number, title: string, planId: number): Promise<string> {
    const base = asciiSlugBase(title, planId)
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
    return slug
  }

  /**
   * 把一本已转换的旅行公开（幂等）：visibility=PUBLIC + 计划生成的回忆 → PUBLIC + TravelPost 投影，同事务。
   * 这样「转换时忘勾公开、之后再补公开」也能让文章里的照片一起可见。
   */
  private async publishConvertedTravel(travelId: number): Promise<boolean> {
    try {
      const current = await prisma.travel.findUnique({
        where: { id: travelId },
        select: { visibility: true },
      })
      if (!current) return false
      const post = await prisma.$transaction(async (tx) => {
        if (current.visibility !== 'PUBLIC') {
          await tx.travel.update({
            where: { id: travelId },
            data: { visibility: 'PUBLIC', isPublic: true },
            select: { id: true },
          })
        }
        await syncConvertedTravelMemoryVisibility(travelId, 'PUBLIC', tx)
        return syncTravelPost(travelId, tx)
      })
      return post?.published === true
    } catch (error) {
      console.error('[space-plan] 已转换旅行公开失败:', (error as Error)?.message)
      return false
    }
  }
}

export const spacePlanService = new SpacePlanService(prismaSpacePlanRepository)

/** 供测试/脚本直接复用（与 service 内一致的清洗规则） */
export { parseTasks }
export type { PlanTask, PlanTaskKind, SpacePlanRecord, SpacePlanStatus }