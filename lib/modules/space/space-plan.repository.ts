/**
 * Space 旅行计划数据访问（Repository）。
 *
 * 与 `space.repository.ts` 同层同风格：只负责读写与序列化，权限/校验一律在 service。
 * 共享清单存在 `tasks` JSON 列里（[{ id, text, kind, done, doneBy?, doneAt? }]）——
 * 清单项不单独建表：它总是跟计划整体读取/整体渲染，且需要「多人同时勾选」时
 * 以单条 toggle 原子更新（见 service.updatePlan），够用且少一次 join。
 */
import { prisma } from '../../db'
import type { Prisma } from '@prisma/client'

export type SpacePlanStatus = 'PLANNING' | 'CONFIRMED' | 'DONE'
export type PlanTaskKind = 'TODO' | 'PACK' | 'PLACE'

export interface PlanTask {
  id: string
  text: string
  kind: PlanTaskKind
  done: boolean
  doneBy: string | null
  doneAt: string | null
}

export interface SpacePlanRecord {
  id: number
  spaceId: number
  title: string
  destination: string | null
  startDate: string | null
  endDate: string | null
  budget: number | null
  note: string | null
  status: SpacePlanStatus
  tasks: PlanTask[]
  /** 清单项总数 / 已完成数（列表页直接展示进度，不必前端再算） */
  taskCount: number
  taskDoneCount: number
  createdById: number | null
  createdBy: string | null
  convertedTravelId: number | null
  /** 已转换的旅行 slug（未转换时为 null；用于详情页给一个「去看旅行」入口） */
  convertedTravelSlug: string | null
  createdAt: string
  updatedAt: string
}

export interface CreatePlanInput {
  spaceId: number
  title: string
  destination: string | null
  startDate: Date | null
  endDate: Date | null
  budget: number | null
  note: string | null
  status: SpacePlanStatus
  tasks: PlanTask[]
  createdById: number | null
  createdBy: string | null
}

export interface UpdatePlanPatch {
  title?: string
  destination?: string | null
  startDate?: Date | null
  endDate?: Date | null
  budget?: number | null
  note?: string | null
  status?: SpacePlanStatus
  tasks?: PlanTask[]
  convertedTravelId?: number | null
}

const TASK_KINDS: PlanTaskKind[] = ['TODO', 'PACK', 'PLACE']

/**
 * tasks 列的容错解析。
 *
 * 本项目的 Prisma 走自研 MariaDB 适配器（lib/prisma-adapter.ts，jsonStrings:true），
 * JSON 列在引擎内外可能以**字符串**或**已解析对象**两种形态出现；
 * 历史数据/手写 SQL 也可能塞进 null 或非法 JSON —— 一律收敛成合法数组，
 * 绝不让一条坏清单把整页打挂。
 */
export function parseTasks(raw: unknown): PlanTask[] {
  let value: unknown = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  const out: PlanTask[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const text = typeof row.text === 'string' ? row.text.trim() : ''
    if (!text) continue
    const kind = TASK_KINDS.includes(row.kind as PlanTaskKind) ? (row.kind as PlanTaskKind) : 'TODO'
    out.push({
      id: typeof row.id === 'string' && row.id ? row.id : `t-${out.length + 1}`,
      text,
      kind,
      done: row.done === true,
      doneBy: typeof row.doneBy === 'string' ? row.doneBy : null,
      doneAt: typeof row.doneAt === 'string' ? row.doneAt : null,
    })
  }
  return out
}

/**
 * 只回读标量 + 关联旅行的 slug：避免适配器对 JSON 列 select-back 的序列化边界
 * （同 lib/modules/travel/space-travel.repository.ts 的做法）。
 */
const PLAN_SELECT = {
  id: true,
  spaceId: true,
  title: true,
  destination: true,
  startDate: true,
  endDate: true,
  budget: true,
  note: true,
  status: true,
  tasks: true,
  createdById: true,
  createdBy: true,
  convertedTravelId: true,
  createdAt: true,
  updatedAt: true,
  convertedTravel: { select: { slug: true } },
} satisfies Prisma.SpaceTravelPlanSelect

type PlanRow = Prisma.SpaceTravelPlanGetPayload<{ select: typeof PLAN_SELECT }>

function serialize(row: PlanRow, tasks: PlanTask[]): SpacePlanRecord {
  const doneCount = tasks.filter((t) => t.done).length
  return {
    id: row.id,
    spaceId: row.spaceId,
    title: row.title,
    destination: row.destination ?? null,
    startDate: row.startDate ? new Date(row.startDate).toISOString() : null,
    endDate: row.endDate ? new Date(row.endDate).toISOString() : null,
    budget: typeof row.budget === 'number' ? row.budget : null,
    note: row.note ?? null,
    status: (row.status ?? 'PLANNING') as SpacePlanStatus,
    tasks,
    taskCount: tasks.length,
    taskDoneCount: doneCount,
    createdById: row.createdById ?? null,
    createdBy: row.createdBy ?? null,
    convertedTravelId: row.convertedTravelId ?? null,
    convertedTravelSlug: row.convertedTravel?.slug ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  }
}

function toJsonTasks(tasks: PlanTask[]): Prisma.InputJsonValue {
  return tasks as unknown as Prisma.InputJsonValue
}

export class PrismaSpacePlanRepository {
  async create(input: CreatePlanInput): Promise<number> {
    const row = await prisma.spaceTravelPlan.create({
      data: {
        spaceId: input.spaceId,
        title: input.title,
        destination: input.destination,
        startDate: input.startDate,
        endDate: input.endDate,
        budget: input.budget,
        note: input.note,
        status: input.status,
        tasks: toJsonTasks(input.tasks),
        createdById: input.createdById,
        createdBy: input.createdBy,
      },
      select: { id: true },
    })
    return row.id
  }

  async findById(planId: number): Promise<SpacePlanRecord | null> {
    const row = await prisma.spaceTravelPlan.findUnique({
      where: { id: planId },
      select: PLAN_SELECT,
    })
    if (!row) return null
    return serialize(row, parseTasks(row.tasks))
  }

  async listForSpace(spaceId: number): Promise<SpacePlanRecord[]> {
    const rows = await prisma.spaceTravelPlan.findMany({
      where: { spaceId },
      // 规划中优先（枚举声明顺序 PLANNING → CONFIRMED → DONE 即业务顺序），再按出发日期
      orderBy: [{ status: 'asc' }, { startDate: 'asc' }, { createdAt: 'desc' }],
      select: PLAN_SELECT,
    })
    return rows.map((row) => serialize(row, parseTasks(row.tasks)))
  }

  async update(planId: number, patch: UpdatePlanPatch): Promise<void> {
    const data: Prisma.SpaceTravelPlanUpdateInput = {}
    if (patch.title !== undefined) data.title = patch.title
    if (patch.destination !== undefined) data.destination = patch.destination
    if (patch.startDate !== undefined) data.startDate = patch.startDate
    if (patch.endDate !== undefined) data.endDate = patch.endDate
    if (patch.budget !== undefined) data.budget = patch.budget
    if (patch.note !== undefined) data.note = patch.note
    if (patch.status !== undefined) data.status = patch.status
    if (patch.tasks !== undefined) data.tasks = toJsonTasks(patch.tasks)
    if (patch.convertedTravelId !== undefined) {
      data.convertedTravel = patch.convertedTravelId == null
        ? { disconnect: true }
        : { connect: { id: patch.convertedTravelId } }
    }
    if (Object.keys(data).length === 0) return
    await prisma.spaceTravelPlan.update({ where: { id: planId }, data, select: { id: true } })
  }

  async remove(planId: number): Promise<void> {
    await prisma.spaceTravelPlan.delete({ where: { id: planId }, select: { id: true } })
  }
}

export const prismaSpacePlanRepository = new PrismaSpacePlanRepository()
