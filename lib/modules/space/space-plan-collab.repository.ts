/**
 * 计划结构化数据访问（P1a：天 / 块 / 块级照片 / Yjs 文档 / 事件 / 在线状态）。
 *
 * 与 `space-plan.repository.ts` 分工：
 *   · space-plan.repository：计划本体（标题/日期/预算/tasks/转换）—— 保持原样，只做加法；
 *   · 本文件：结构化行程 + 协同侧的读写，全部「数据变更 + 事件追加」放在**同一个事务**里，
 *     保证「数据落库 = 广播发生」（docs/plan-p1-collab-spec.md §1/§4）。
 *
 * 关键约定：
 *   · 行级 version 乐观锁：块级 PATCH/DELETE 传 version，WHERE 里带上它 → count=0 即冲突（service 转 409）；
 *   · toggle 是 CAS（只比较 done），不覆盖别人改的 title/时间，也不会因为并发 toggle 丢状态；
 *   · 时间用「墙上时间」：'YYYY-MM-DDTHH:mm' → Date.UTC(...) 落库，读回 toISOString，前端用 getUTC* 渲染
 *     （与 Travel ItineraryItem 的历史约定一致，见 tests/unit/travel-itinerary-time-tz.test.ts）；
 *   · JSON 列（planMeta/事件 payload）走自研适配器 jsonStrings=true，读出可能是字符串 → 容错解析。
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../../db'
import {
  buildPlanUpdateData,
  type PlanMeta,
  type UpdatePlanPatch,
} from './space-plan.repository'
import type { PlanEngineItinerary, PlanItemKind } from './plan-engine'

/** 单计划事件一次最多回放多少条（前端 SSE 断线补播的批大小） */
export const PLAN_EVENT_PAGE_MAX = 200
/** 在线状态过期时间（与实时服务 15s 心跳 / 45s 过期一致） */
export const PRESENCE_TTL_SECONDS = 45
/** Yjs 快照体积上限（防大包 DoS；文档正常在几十 KB 以内，与实时服务单帧 4MB 对齐） */
export const DOC_STATE_MAX_BYTES = 4 * 1024 * 1024

// ============================================================
// 记录类型（API 序列化后的形状）
// ============================================================

export interface SpacePlanItemRecord {
  id: number
  dayId: number
  kind: PlanItemKind
  /** ISO 字符串（UTC 字段即墙上时间） */
  startAt: string | null
  endAt: string | null
  title: string
  place: string | null
  /** 金额用分 */
  costCents: number | null
  note: string | null
  done: boolean
  doneBy: string | null
  sortOrder: number
  version: number
  updatedBy: string | null
  updatedAt: string
  mediaIds: number[]
}

export interface SpacePlanDayRecord {
  id: number
  planId: number
  /** 'YYYY-MM-DD' */
  date: string | null
  title: string | null
  theme: string | null
  summary: string | null
  sortOrder: number
  version: number
  updatedBy: string | null
  updatedAt: string
  items: SpacePlanItemRecord[]
}

export interface SpacePlanPresenceRecord {
  userId: number
  username: string
  nickname: string | null
  editingItemId: number | null
  cursor: number | null
  lastSeenAt: string
}

export interface SpacePlanDocRecord {
  state: Buffer | null
  revision: number
  lastEvent: number
}

export interface PlanItemEventPayload {
  id: number
  dayId: number
  version: number
  [key: string]: unknown
}

// ============================================================
// 墙上时间工具（纯函数，可单测）
// ============================================================

const WALL_CLOCK_TAIL = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/

/** 'YYYY-MM-DDTHH:mm'（墙上时间）→ Date（UTC 字段 = 墙上时间）；也接受 ISO；非法返回 null */
export function wallClockToDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const text = String(value).trim()
  const match = WALL_CLOCK_TAIL.exec(text)
  if (match) {
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])))
    return Number.isNaN(date.getTime()) ? null : date
  }
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Date → ISO（null 透传） */
export function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * 'YYYY-MM-DD' → Date，用于 @db.Date（纯日历日，无时区语义）。
 *
 * 用**本地 0 点**构造，和读回时用本地字段取值配套：
 *   MySQL DATE 无时区，mysql2 会把 '2026-12-06' 解析成「本地 2026-12-06 00:00」，
 *   写的时候也按本地字段格式化成 '2026-12-06' —— 两端都用本地日历日，
 *   容器 TZ=UTC 与开发机 TZ=+08 结果一致（UTC+8 下如果用 Date.UTC 构造会整体差一天）。
 */
export function ymdToDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim())
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

/** @db.Date 读回 → 'YYYY-MM-DD'（用本地字段，与 ymdToDate 的本地 0 点配套） */
export function dayDateToYmd(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Date → 'YYYY-MM-DD'（用 getUTC*；用于 Timestamp 类字段，如计划的 startDate 由 ISO 日期解析而来） */
export function dateToYmd(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function asInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function asText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text.slice(0, max) : null
}

// ============================================================
// 行 → 记录
// ============================================================

const ITEM_SELECT = {
  id: true,
  dayId: true,
  kind: true,
  startAt: true,
  endAt: true,
  title: true,
  place: true,
  costCents: true,
  note: true,
  done: true,
  doneBy: true,
  sortOrder: true,
  version: true,
  updatedBy: true,
  updatedAt: true,
  media: { select: { mediaId: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.SpacePlanItemSelect

type ItemRow = Prisma.SpacePlanItemGetPayload<{ select: typeof ITEM_SELECT }>

const DAY_SELECT = {
  id: true,
  planId: true,
  date: true,
  title: true,
  theme: true,
  summary: true,
  sortOrder: true,
  version: true,
  updatedBy: true,
  updatedAt: true,
  items: { select: ITEM_SELECT, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.SpacePlanDaySelect

type DayRow = Prisma.SpacePlanDayGetPayload<{ select: typeof DAY_SELECT }>

function serializeItem(row: ItemRow): SpacePlanItemRecord {
  return {
    id: row.id,
    dayId: row.dayId,
    kind: (row.kind ?? 'SPOT') as PlanItemKind,
    startAt: toIsoOrNull(row.startAt),
    endAt: toIsoOrNull(row.endAt),
    title: row.title,
    place: row.place ?? null,
    costCents: row.costCents ?? null,
    note: row.note ?? null,
    done: row.done === true,
    doneBy: row.doneBy ?? null,
    sortOrder: row.sortOrder,
    version: row.version ?? 0,
    updatedBy: row.updatedBy ?? null,
    updatedAt: new Date(row.updatedAt).toISOString(),
    mediaIds: row.media.map((m) => m.mediaId),
  }
}

function serializeDay(row: DayRow): SpacePlanDayRecord {
  return {
    id: row.id,
    planId: row.planId,
    date: dayDateToYmd(row.date),
    title: row.title ?? null,
    theme: row.theme ?? null,
    summary: row.summary ?? null,
    sortOrder: row.sortOrder,
    version: row.version ?? 0,
    updatedBy: row.updatedBy ?? null,
    updatedAt: new Date(row.updatedAt).toISOString(),
    items: row.items.map(serializeItem),
  }
}

// ============================================================
// 入参类型
// ============================================================

export interface ItemCreateData {
  dayId: number
  kind: PlanItemKind
  startAt: Date | null
  endAt: Date | null
  title: string
  place: string | null
  costCents: number | null
  note: string | null
  done?: boolean
  mediaIds?: number[]
}

export interface ItemUpdateData {
  title?: string
  kind?: PlanItemKind
  startAt?: Date | null
  endAt?: Date | null
  place?: string | null
  costCents?: number | null
  note?: string | null
  done?: boolean
  mediaIds?: number[]
}

export interface PresenceInput {
  userId: number
  username: string
  nickname?: string | null
  editingItemId?: number | null
  cursor?: number | null
}

/** 内部 plan-doc 端点收到的物化行（id/dayId 是 Yjs 里的字符串，可能是临时 id） */
export interface MaterializedDayInput {
  id?: string | null
  date?: string | null
  title?: string | null
  theme?: string | null
  summary?: string | null
}

export interface MaterializedItemInput {
  id?: string | null
  dayId?: string | null
  kind?: string | null
  startAt?: string | null
  endAt?: string | null
  title?: string | null
  place?: string | null
  costCents?: number | null
  note?: string | null
  done?: boolean | null
  doneBy?: string | null
  sortOrder?: number | null
  mediaIds?: number[] | null
}

export interface PlanDocSyncInput {
  planId: number
  /** base64(Y.encodeStateAsUpdate(doc)) */
  yjsState: string
  materialized: {
    days?: MaterializedDayInput[]
    items?: MaterializedItemInput[]
    meta?: PlanMeta | null
  }
  presence?: PresenceInput[]
  source?: string | null
  clientId?: string | null
  sentAt?: string | null
  /** 非实时服务调用时作为事件 actor（内部端点固定 'collab'） */
  actor?: string
}

export interface PlanDocSyncResult {
  revision: number
  eventId: number
  lastEventId: number
  idempotent: boolean
  idMap: { days: Record<string, number>; items: Record<string, number> }
}

// ============================================================
// Repository
// ============================================================

export class PrismaSpacePlanCollabRepository {
  // ---------- 读 ----------

  async findDays(planId: number): Promise<SpacePlanDayRecord[]> {
    const rows = await prisma.spacePlanDay.findMany({
      where: { planId },
      orderBy: { sortOrder: 'asc' },
      select: DAY_SELECT,
    })
    return rows.map(serializeDay)
  }

  async findItem(itemId: number): Promise<SpacePlanItemRecord | null> {
    const row = await prisma.spacePlanItem.findUnique({ where: { id: itemId }, select: ITEM_SELECT })
    return row ? serializeItem(row) : null
  }

  /** 块 + 所属计划 id（做跨空间/跨计划判权；不存在返回 null） */
  async findItemWithPlan(itemId: number): Promise<{ item: SpacePlanItemRecord; planId: number } | null> {
    const row = await prisma.spacePlanItem.findUnique({
      where: { id: itemId },
      select: { ...ITEM_SELECT, day: { select: { planId: true } } },
    })
    if (!row) return null
    const { day, ...rest } = row
    return { item: serializeItem(rest as ItemRow), planId: day.planId }
  }

  async findDayWithPlan(dayId: number): Promise<{ id: number; planId: number } | null> {
    return prisma.spacePlanDay.findUnique({ where: { id: dayId }, select: { id: true, planId: true } })
  }

  async lastEventId(planId: number): Promise<number> {
    const result = await prisma.spacePlanEvent.aggregate({ where: { planId }, _max: { id: true } })
    return result._max.id ?? 0
  }

  async listPresence(planId: number): Promise<SpacePlanPresenceRecord[]> {
    const cutoff = new Date(Date.now() - PRESENCE_TTL_SECONDS * 1000)
    const rows = await prisma.spacePlanPresence.findMany({
      where: { planId, lastSeenAt: { gte: cutoff } },
      orderBy: { lastSeenAt: 'asc' },
    })
    return rows.map((row) => ({
      userId: row.userId,
      username: row.username,
      nickname: row.nickname ?? null,
      editingItemId: row.editingItemId ?? null,
      cursor: row.cursor ?? null,
      lastSeenAt: new Date(row.lastSeenAt).toISOString(),
    }))
  }

  async getDoc(planId: number): Promise<SpacePlanDocRecord | null> {
    const row = await prisma.spacePlanDoc.findUnique({
      where: { planId },
      select: { state: true, revision: true, lastEvent: true },
    })
    if (!row) return null
    const state = row.state ? Buffer.from(row.state) : null
    return { state, revision: row.revision ?? 0, lastEvent: row.lastEvent ?? 0 }
  }

  async listEvents(planId: number, since: number, limit = PLAN_EVENT_PAGE_MAX): Promise<
    Array<{ id: number; planId: number; actor: string; action: string; payload: unknown; createdAt: string }>
  > {
    const take = Math.min(Math.max(limit, 1), PLAN_EVENT_PAGE_MAX)
    const rows = await prisma.spacePlanEvent.findMany({
      where: { planId, id: { gt: since } },
      orderBy: { id: 'asc' },
      take,
      select: { id: true, planId: true, actor: true, action: true, payload: true, createdAt: true },
    })
    return rows.map((row) => ({
      id: row.id,
      planId: row.planId,
      actor: row.actor,
      action: row.action,
      // 适配器 jsonStrings=true：payload 可能是字符串，这里统一成对象（前端不用再判断）
      payload: parseJsonValue(row.payload),
      createdAt: new Date(row.createdAt).toISOString(),
    }))
  }

  // ---------- 事件 ----------

  /** 追加事件（调用方负责放进事务；返回事件 id = 广播游标） */
  async appendEvent(
    tx: Prisma.TransactionClient,
    planId: number,
    actor: string,
    action: string,
    payload: unknown,
  ): Promise<number> {
    const row = await tx.spacePlanEvent.create({
      data: {
        planId,
        actor: actor.slice(0, 255),
        action: action.slice(0, 40),
        payload: (payload ?? {}) as Prisma.InputJsonValue,
      },
      select: { id: true },
    })
    return row.id
  }

  // ---------- 计划级（version 乐观锁） ----------

  /**
   * 计划级字段更新（数据 + 事件同事务）：
   *   · 带 version → CAS（WHERE version = ?），不匹配返回 updated=0，由 service 转 409 + 当前行；
   *   · 不带 version → 保持老客户端行为（不加锁），但仍递增 version 让后续客户端知道变了。
   */
  async updatePlan(
    planId: number,
    expectedVersion: number | null,
    patch: UpdatePlanPatch,
    actor: string,
  ): Promise<{ updated: number; eventId: number | null; nextVersion: number | null }> {
    return prisma.$transaction(async (tx) => {
      const data = buildPlanUpdateData(patch)
      data.version = { increment: 1 }
      if (expectedVersion == null) {
        const row = await tx.spaceTravelPlan.update({
          where: { id: planId },
          data,
          select: { version: true },
        })
        const eventId = await this.appendEvent(tx, planId, actor, 'plan.update', {
          fields: Object.keys(patch),
          version: row.version,
        })
        return { updated: 1, eventId, nextVersion: row.version }
      }
      const result = await tx.spaceTravelPlan.updateMany({
        where: { id: planId, version: expectedVersion },
        data,
      })
      if (result.count === 0) return { updated: 0, eventId: null, nextVersion: null }
      const eventId = await this.appendEvent(tx, planId, actor, 'plan.update', {
        fields: Object.keys(patch),
        version: expectedVersion + 1,
      })
      return { updated: result.count, eventId, nextVersion: expectedVersion + 1 }
    })
  }

  // ---------- 块级 CRUD（数据 + 事件同事务） ----------

  async createItem(
    planId: number,
    actor: string,
    data: ItemCreateData,
  ): Promise<{ item: SpacePlanItemRecord; eventId: number }> {
    const mediaIds = normalizeMediaIds(data.mediaIds)
    const result = await prisma.$transaction(async (tx) => {
      const max = await tx.spacePlanItem.aggregate({ where: { dayId: data.dayId }, _max: { sortOrder: true } })
      const sortOrder = (max._max.sortOrder ?? -1) + 1
      const created = await tx.spacePlanItem.create({
        data: {
          dayId: data.dayId,
          kind: data.kind,
          startAt: data.startAt,
          endAt: data.endAt,
          title: data.title,
          place: data.place,
          costCents: data.costCents,
          note: data.note,
          done: data.done === true,
          doneBy: data.done === true ? actor : null,
          sortOrder,
          version: 0,
          updatedBy: actor,
          ...(mediaIds.length > 0
            ? { media: { create: mediaIds.map((mediaId, index) => ({ mediaId, sortOrder: index })) } }
            : {}),
        },
        select: ITEM_SELECT,
      })
      const item = serializeItem(created)
      const eventId = await this.appendEvent(tx, planId, actor, 'item.create', { item })
      return { item, eventId }
    })
    return result
  }

  async updateItemVersioned(
    planId: number,
    itemId: number,
    actor: string,
    expectedVersion: number,
    patch: ItemUpdateData,
  ): Promise<{ item: SpacePlanItemRecord | null; eventId: number | null; conflict: boolean }> {
    const mediaIds = patch.mediaIds === undefined ? undefined : normalizeMediaIds(patch.mediaIds)
    return prisma.$transaction(async (tx) => {
      const current = await tx.spacePlanItem.findUnique({ where: { id: itemId }, select: ITEM_SELECT })
      if (!current) return { item: null, eventId: null, conflict: false }

      const data: Prisma.SpacePlanItemUpdateManyMutationInput = {}
      if (patch.title !== undefined) data.title = patch.title
      if (patch.kind !== undefined) data.kind = patch.kind
      if (patch.startAt !== undefined) data.startAt = patch.startAt
      if (patch.endAt !== undefined) data.endAt = patch.endAt
      if (patch.place !== undefined) data.place = patch.place
      if (patch.costCents !== undefined) data.costCents = patch.costCents
      if (patch.note !== undefined) data.note = patch.note
      if (patch.done !== undefined) {
        data.done = patch.done
        data.doneBy = patch.done ? actor : null
      }
      data.version = { increment: 1 }
      data.updatedBy = actor

      const updated = await tx.spacePlanItem.updateMany({
        where: { id: itemId, version: expectedVersion },
        data,
      })
      if (updated.count === 0) {
        const latest = await tx.spacePlanItem.findUnique({ where: { id: itemId }, select: ITEM_SELECT })
        return { item: latest ? serializeItem(latest) : null, eventId: null, conflict: true }
      }

      if (mediaIds !== undefined) {
        await tx.spacePlanItemMedia.deleteMany({ where: { itemId } })
        if (mediaIds.length > 0) {
          await tx.spacePlanItemMedia.createMany({
            data: mediaIds.map((mediaId, index) => ({ itemId, mediaId, sortOrder: index })),
          })
        }
      }

      const fresh = await tx.spacePlanItem.findUnique({ where: { id: itemId }, select: ITEM_SELECT })
      const item = fresh ? serializeItem(fresh) : null
      const eventId = await this.appendEvent(tx, planId, actor, 'item.update', { item })
      return { item, eventId, conflict: false }
    })
  }

  async deleteItemVersioned(
    planId: number,
    itemId: number,
    actor: string,
    expectedVersion: number,
  ): Promise<{ deleted: boolean; current: SpacePlanItemRecord | null; eventId: number | null }> {
    return prisma.$transaction(async (tx) => {
      const current = await tx.spacePlanItem.findUnique({ where: { id: itemId }, select: ITEM_SELECT })
      if (!current) return { deleted: false, current: null, eventId: null }
      const result = await tx.spacePlanItem.deleteMany({ where: { id: itemId, version: expectedVersion } })
      if (result.count === 0) {
        return { deleted: false, current: serializeItem(current), eventId: null }
      }
      const version = (current.version ?? 0) + 1
      const eventId = await this.appendEvent(tx, planId, actor, 'item.delete', {
        id: itemId,
        dayId: current.dayId,
        version,
      })
      return { deleted: true, current: null, eventId }
    })
  }

  /**
   * 原子勾选：CAS 只比较 done（不比较 version），
   *   · 别人改了标题/时间 → 不受影响（不覆盖别人的改动）；
   *   · 两人同时勾选 → 一个成功、另一个重试后读到最新值，不会出现「都点了却还是未勾」。
   */
  async toggleItemAtomic(
    planId: number,
    itemId: number,
    actor: string,
    done?: boolean,
  ): Promise<{ item: SpacePlanItemRecord | null; eventId: number | null }> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await prisma.spacePlanItem.findUnique({
        where: { id: itemId },
        select: { id: true, done: true },
      })
      if (!current) return { item: null, eventId: null }
      const nextDone = done === undefined ? !current.done : done === true
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.spacePlanItem.updateMany({
          where: { id: itemId, done: current.done },
          data: {
            done: nextDone,
            doneBy: nextDone ? actor : null,
            version: { increment: 1 },
            updatedBy: actor,
          },
        })
        if (updated.count === 0) return null
        const fresh = await tx.spacePlanItem.findUnique({ where: { id: itemId }, select: ITEM_SELECT })
        const item = fresh ? serializeItem(fresh) : null
        const eventId = await this.appendEvent(tx, planId, actor, 'item.update', { item })
        return { item, eventId }
      })
      if (result) return result
    }
    const latest = await prisma.spacePlanItem.findUnique({ where: { id: itemId }, select: ITEM_SELECT })
    return { item: latest ? serializeItem(latest) : null, eventId: null }
  }

  /**
   * 跨天/排序：把一块移到目标天，并把「目标天」与「原天」重新编号成 0..n-1。
   * 排序变化会递增受影响行的 version（让拿到旧 version 的客户端知道顺序变了）。
   */
  async moveItem(
    planId: number,
    itemId: number,
    actor: string,
    targetDayId: number,
    targetSortOrder: number,
  ): Promise<{ item: SpacePlanItemRecord | null; eventId: number | null; moved: boolean }> {
    return prisma.$transaction(async (tx) => {
      const current = await tx.spacePlanItem.findUnique({
        where: { id: itemId },
        select: { id: true, dayId: true, sortOrder: true },
      })
      if (!current) return { item: null, eventId: null, moved: false }

      const sourceDayId = current.dayId
      await tx.spacePlanItem.update({
        where: { id: itemId },
        data: { dayId: targetDayId, sortOrder: Math.max(0, Math.trunc(targetSortOrder)) },
      })

      const orderOf = async (dayId: number): Promise<Array<{ id: number; sortOrder: number }>> =>
        tx.spacePlanItem.findMany({ where: { dayId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, sortOrder: true } })

      const renumber = async (dayId: number) => {
        const rows = await orderOf(dayId)
        const changed = rows.filter((row, index) => row.sortOrder !== index)
        for (const row of changed) {
          await tx.spacePlanItem.update({
            where: { id: row.id },
            data: { sortOrder: rows.findIndex((r) => r.id === row.id), version: { increment: 1 }, updatedBy: actor },
          })
        }
        return rows.map((row) => row.id)
      }

      const targetOrder = await renumber(targetDayId)
      if (sourceDayId !== targetDayId) await renumber(sourceDayId)

      const fresh = await tx.spacePlanItem.findUnique({ where: { id: itemId }, select: ITEM_SELECT })
      const item = fresh ? serializeItem(fresh) : null
      const eventId = await this.appendEvent(tx, planId, actor, 'item.reorder', {
        item,
        dayId: targetDayId,
        order: targetOrder,
      })
      return { item, eventId, moved: true }
    })
  }

  // ---------- 创建骨架 / Yjs 文档 ----------

  /**
   * 把引擎输出落成天 + 块（创建计划时调用）。
   * 与计划行不在同一事务（计划行先建），失败由 service 补偿删除计划，避免出现半截数据。
   */
  async createSkeleton(
    planId: number,
    itinerary: PlanEngineItinerary,
    actor: string,
  ): Promise<{ days: SpacePlanDayRecord[]; eventId: number }> {
    const eventId = await prisma.$transaction(async (tx) => {
      for (const day of itinerary.days) {
        const dayRow = await tx.spacePlanDay.create({
          data: {
            planId,
            date: ymdToDate(day.date),
            title: day.title.slice(0, 120),
            theme: day.theme ? day.theme.slice(0, 60) : null,
            summary: day.summary,
            sortOrder: day.sortOrder,
            version: 0,
            updatedBy: actor,
          },
          select: { id: true },
        })
        for (const entry of day.items) {
          await tx.spacePlanItem.create({
            data: {
              dayId: dayRow.id,
              kind: entry.kind,
              startAt: wallClockToDate(entry.startAt),
              endAt: wallClockToDate(entry.endAt),
              title: entry.title.slice(0, 200),
              place: entry.place ? entry.place.slice(0, 200) : null,
              costCents: entry.costCents,
              note: entry.note,
              sortOrder: entry.sortOrder,
              version: 0,
              updatedBy: actor,
            },
            select: { id: true },
          })
        }
      }
      await tx.spacePlanDoc.upsert({
        where: { planId },
        create: { planId, state: Buffer.alloc(0), revision: 0, lastEvent: 0 },
        update: {},
        select: { planId: true },
      })
      return this.appendEvent(tx, planId, actor, 'plan.create', {
        engineVersion: itinerary.engineVersion,
        dayCount: itinerary.dayCount,
        itemCount: itinerary.days.reduce((sum, day) => sum + day.items.length, 0),
        truncated: itinerary.truncated,
      })
    })
    const days = await this.findDays(planId)
    return { days, eventId }
  }

  /** 兜底：给「没有骨架」的计划补一份空 Yjs 文档行（读文档端点用） */
  async ensureDoc(planId: number): Promise<void> {
    await prisma.spacePlanDoc.upsert({
      where: { planId },
      create: { planId, state: Buffer.alloc(0), revision: 0, lastEvent: 0 },
      update: {},
      select: { planId: true },
    })
  }

  /**
   * 内部 plan-doc 提交（仅实时服务调用）：Yjs 快照 + 物化 rows + 事件，同一个事务。
   *
   * 幂等：与库里 state 字节完全相同 → 视为重试，直接返回既有 revision/eventId，不做任何写入
   * （实时服务失败重试 3 次也不会重复建行/重复事件）。
   */
  async syncDoc(input: PlanDocSyncInput): Promise<PlanDocSyncResult> {
    const planId = input.planId
    const state = decodeBase64(input.yjsState)
    if (state.length > DOC_STATE_MAX_BYTES) throw new Error('文档快照过大')

    const existing = await this.getDoc(planId)
    if (existing?.state && existing.state.length === state.length && Buffer.compare(existing.state, state) === 0) {
      // 幂等短路：state 没变 = 重试/纯 presence 心跳。presence 仍要刷新（谁正在编辑哪块），
      // 但不物化、不追加事件、不推进 revision —— 重试 3 次也不会重复建行。
      if (input.presence !== undefined) {
        await prisma.$transaction(async (tx) => {
          await this.replacePresenceTx(tx, planId, input.presence ?? [])
        })
      }
      return {
        revision: existing.revision,
        eventId: existing.lastEvent,
        lastEventId: existing.lastEvent,
        idempotent: true,
        idMap: { days: {}, items: {} },
      }
    }

    const actor = (input.actor || 'collab').slice(0, 255)
    return prisma.$transaction(async (tx) => {
      const idMap = await this.materializeTx(tx, planId, input, actor)
      if (input.presence !== undefined) {
        await this.replacePresenceTx(tx, planId, input.presence)
      }
      const revision = (existing?.revision ?? 0) + 1
      const eventId = await this.appendEvent(tx, planId, actor, 'doc.sync', {
        revision,
        source: input.source ?? null,
        clientId: input.clientId ?? null,
        days: idMap.days,
        items: idMap.items,
      })
      await tx.spacePlanDoc.upsert({
        where: { planId },
        create: { planId, state: toBytes(state), revision, lastEvent: eventId },
        update: { state: toBytes(state), revision, lastEvent: eventId },
        select: { planId: true },
      })
      const planData: Prisma.SpaceTravelPlanUpdateInput = { docRevision: revision }
      const meta = input.materialized.meta
      if (meta && typeof meta === 'object') {
        planData.planMeta = meta as unknown as Prisma.InputJsonValue
      }
      await tx.spaceTravelPlan.update({ where: { id: planId }, data: planData, select: { id: true } })
      return { revision, eventId, lastEventId: eventId, idempotent: false, idMap }
    })
  }

  /** 物化：以 Yjs 快照为准，按 id（numeric）或 (dayId+sortOrder) 对齐已有行，缺的建、多的删 */
  private async materializeTx(
    tx: Prisma.TransactionClient,
    planId: number,
    input: PlanDocSyncInput,
    actor: string,
  ): Promise<{ days: Record<string, number>; items: Record<string, number> }> {
    const incomingDays = Array.isArray(input.materialized.days) ? input.materialized.days : []
    const incomingItems = Array.isArray(input.materialized.items) ? input.materialized.items : []
    const idMap: { days: Record<string, number>; items: Record<string, number> } = { days: {}, items: {} }

    const existingDays = await tx.spacePlanDay.findMany({
      where: { planId },
      select: { id: true, sortOrder: true, date: true, title: true, theme: true, summary: true },
    })
    const dayById = new Map(existingDays.map((row) => [row.id, row]))
    const usedDayIds = new Set<number>()

    for (let index = 0; index < incomingDays.length; index += 1) {
      const incoming = incomingDays[index]
      const numericId = asInt(incoming.id)
      let target = numericId != null ? dayById.get(numericId) : undefined
      if (!target) {
        // 无 id / id 是 Yjs 临时 id：按天序号（unique(planId, sortOrder)）对齐，避免重复建行
        target = existingDays.find((row) => row.sortOrder === index && !usedDayIds.has(row.id))
      }
      const data = {
        date: ymdToDate(incoming.date),
        title: asText(incoming.title, 120),
        theme: asText(incoming.theme, 60),
        summary: asText(incoming.summary, 5000),
        sortOrder: index,
        updatedBy: actor,
      }
      let dayId: number
      if (target && !usedDayIds.has(target.id)) {
        usedDayIds.add(target.id)
        dayId = target.id
        if (hasDayChanged(target, data)) {
          await tx.spacePlanDay.update({
            where: { id: dayId },
            data: { ...data, version: { increment: 1 } },
            select: { id: true },
          })
        }
      } else {
        const created = await tx.spacePlanDay.create({
          data: { planId, ...data, version: 0 },
          select: { id: true },
        })
        dayId = created.id
      }
      if (incoming.id) idMap.days[String(incoming.id)] = dayId
      idMap.days[String(dayId)] = dayId
    }

    if (incomingDays.length > 0) {
      const removeDayIds = existingDays.map((row) => row.id).filter((id) => !usedDayIds.has(id))
      if (removeDayIds.length > 0) {
        await tx.spacePlanDay.deleteMany({ where: { planId, id: { in: removeDayIds } } })
      }
    }

    const existingItems = await tx.spacePlanItem.findMany({
      where: { day: { planId } },
      select: {
        id: true,
        dayId: true,
        kind: true,
        startAt: true,
        endAt: true,
        title: true,
        place: true,
        costCents: true,
        note: true,
        done: true,
        doneBy: true,
        sortOrder: true,
      },
    })
    const itemById = new Map(existingItems.map((row) => [row.id, row]))
    const usedItemIds = new Set<number>()

    for (let index = 0; index < incomingItems.length; index += 1) {
      const incoming = incomingItems[index]
      const numericId = asInt(incoming.id)
      let target = numericId != null ? itemById.get(numericId) : undefined
      const mappedDayId = incoming.dayId ? idMap.days[String(incoming.dayId)] ?? asInt(incoming.dayId) ?? null : null
      const dayId = mappedDayId != null ? mappedDayId : target?.dayId ?? null
      if (dayId == null) continue
      if (!target) {
        // 无 id / 临时 id：按 (dayId, sortOrder) 对齐，避免「同一份状态重复提交」多建行
        target = existingItems.find(
          (row) => row.dayId === dayId && row.sortOrder === (asInt(incoming.sortOrder) ?? index) && !usedItemIds.has(row.id),
        )
      }
      const data = {
        dayId,
        kind: normalizeKind(incoming.kind),
        startAt: toDateOrNull(incoming.startAt),
        endAt: toDateOrNull(incoming.endAt),
        title: (asText(incoming.title, 200) ?? '待定').slice(0, 200),
        place: asText(incoming.place, 200),
        costCents: asInt(incoming.costCents),
        note: asText(incoming.note, 5000),
        done: incoming.done === true,
        doneBy: asText(incoming.doneBy, 255),
        sortOrder: asInt(incoming.sortOrder) ?? index,
        updatedBy: actor,
      }
      let itemId: number
      if (target && !usedItemIds.has(target.id)) {
        usedItemIds.add(target.id)
        itemId = target.id
        if (hasItemChanged(target, data)) {
          await tx.spacePlanItem.update({
            where: { id: itemId },
            data: { ...data, version: { increment: 1 } },
            select: { id: true },
          })
        }
      } else {
        const created = await tx.spacePlanItem.create({
          data: { ...data, version: 0 },
          select: { id: true },
        })
        itemId = created.id
      }
      if (incoming.id) idMap.items[String(incoming.id)] = itemId
      idMap.items[String(itemId)] = itemId

      if (Array.isArray(incoming.mediaIds)) {
        const mediaIds = normalizeMediaIds(incoming.mediaIds)
        const currentLinks = await tx.spacePlanItemMedia.findMany({
          where: { itemId },
          select: { mediaId: true },
          orderBy: { sortOrder: 'asc' },
        })
        const same = currentLinks.length === mediaIds.length && currentLinks.every((row, i) => row.mediaId === mediaIds[i])
        if (!same) {
          await tx.spacePlanItemMedia.deleteMany({ where: { itemId } })
          if (mediaIds.length > 0) {
            await tx.spacePlanItemMedia.createMany({
              data: mediaIds.map((mediaId, order) => ({ itemId, mediaId, sortOrder: order })),
            })
          }
        }
      }
    }

    if (incomingItems.length > 0) {
      const removeItemIds = existingItems.map((row) => row.id).filter((id) => !usedItemIds.has(id))
      if (removeItemIds.length > 0) {
        await tx.spacePlanItem.deleteMany({ where: { id: { in: removeItemIds } } })
      }
    }

    return idMap
  }

  /** presence 按「快照」语义整体替换：不在本次快照里的行删除（实时服务断开即清空） */
  private async replacePresenceTx(
    tx: Prisma.TransactionClient,
    planId: number,
    presence: PresenceInput[],
  ): Promise<void> {
    const rows = presence
      .filter((row) => row && Number.isFinite(Number(row.userId)))
      .map((row) => ({
        userId: Math.trunc(Number(row.userId)),
        username: String(row.username ?? '').slice(0, 255),
        nickname: row.nickname == null ? null : String(row.nickname).slice(0, 255),
        editingItemId: asInt(row.editingItemId),
        cursor: asInt(row.cursor),
      }))
    const userIds = rows.map((row) => row.userId)
    if (userIds.length === 0) {
      await tx.spacePlanPresence.deleteMany({ where: { planId } })
      return
    }
    await tx.spacePlanPresence.deleteMany({ where: { planId, userId: { notIn: userIds } } })
    for (const row of rows) {
      await tx.spacePlanPresence.upsert({
        where: { planId_userId: { planId, userId: row.userId } },
        create: { planId, ...row },
        update: { username: row.username, nickname: row.nickname, editingItemId: row.editingItemId, cursor: row.cursor },
        select: { planId: true },
      })
    }
  }
}

// ============================================================
// 小工具
// ============================================================

function parseJsonValue(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/** Prisma 7 的 Bytes 入参要求 Uint8Array<ArrayBuffer>（Buffer 的泛型不兼容），写入前转一次 */
function toBytes(state: Buffer): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(state.length)
  out.set(state)
  return out
}

function decodeBase64(value: string): Buffer {
  const text = String(value ?? '').trim()
  if (!text) return Buffer.alloc(0)
  // base64（允许 URL-safe 与无 padding）
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

function normalizeMediaIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const out: number[] = []
  for (const raw of value) {
    const id = asInt(raw)
    if (id != null && id > 0 && !out.includes(id)) out.push(id)
  }
  return out.slice(0, 50)
}

function normalizeKind(value: string | null | undefined): PlanItemKind {
  const kinds: PlanItemKind[] = ['TRANSPORT', 'HOTEL', 'FOOD', 'SPOT', 'ACTIVITY', 'FLEX']
  const text = String(value ?? '').trim().toUpperCase() as PlanItemKind
  return kinds.includes(text) ? text : 'SPOT'
}

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function hasDayChanged(
  row: { date: Date | null; title: string | null; theme: string | null; summary: string | null; sortOrder: number },
  data: { date: Date | null; title: string | null; theme: string | null; summary: string | null; sortOrder: number },
): boolean {
  const sameDate = (a: Date | null, b: Date | null) =>
    (a == null && b == null) || (a != null && b != null && dayDateToYmd(a) === dayDateToYmd(b))
  return (
    !sameDate(row.date, data.date) ||
    row.title !== data.title ||
    row.theme !== data.theme ||
    row.summary !== data.summary ||
    row.sortOrder !== data.sortOrder
  )
}

function hasItemChanged(
  row: {
    dayId: number
    kind: string
    startAt: Date | null
    endAt: Date | null
    title: string
    place: string | null
    costCents: number | null
    note: string | null
    done: boolean
    doneBy: string | null
    sortOrder: number
  },
  data: {
    dayId: number
    kind: PlanItemKind
    startAt: Date | null
    endAt: Date | null
    title: string
    place: string | null
    costCents: number | null
    note: string | null
    done: boolean
    doneBy: string | null
    sortOrder: number
  },
): boolean {
  const sameTime = (a: Date | null, b: Date | null) =>
    (a == null && b == null) || (a != null && b != null && a.getTime() === b.getTime())
  return (
    row.dayId !== data.dayId ||
    row.kind !== data.kind ||
    !sameTime(row.startAt, data.startAt) ||
    !sameTime(row.endAt, data.endAt) ||
    row.title !== data.title ||
    (row.place ?? null) !== data.place ||
    (row.costCents ?? null) !== data.costCents ||
    (row.note ?? null) !== data.note ||
    row.done !== data.done ||
    (row.doneBy ?? null) !== data.doneBy ||
    row.sortOrder !== data.sortOrder
  )
}

export const prismaSpacePlanCollabRepository = new PrismaSpacePlanCollabRepository()
