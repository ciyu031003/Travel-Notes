/**
 * 空间旅行计划 —— 客户端共享类型与小工具（纯前端，不依赖服务端模块）。
 *
 * 为什么单独一份类型：计划详情页是**静态导出**的客户端壳（移动端 Capacitor），
 * 若从 lib/modules/space/space-plan.service 取类型，会把 prisma / service 层
 * 拖进浏览器 bundle。约定同 space-overview.types.ts：类型与实现分离。
 */
import type { LucideIcon } from 'lucide-react'
import {
  CheckCircle2,
  Clock,
  MapPin,
  ShoppingBag,
  Sparkles,
  type BadgeTone,
} from '@/lib/mobile/icon-system'

export type PlanStatus = 'PLANNING' | 'CONFIRMED' | 'DONE'
export type PlanTaskKind = 'TODO' | 'PACK' | 'PLACE'

export interface SpacePlanTask {
  id: string
  text: string
  kind: PlanTaskKind
  done: boolean
  doneBy: string | null
  doneAt: string | null
}

export interface SpacePlan {
  id: number
  spaceId: number
  title: string
  destination: string | null
  startDate: string | null
  endDate: string | null
  budget: number | null
  note: string | null
  status: PlanStatus
  tasks: SpacePlanTask[]
  taskCount: number
  taskDoneCount: number
  createdById: number | null
  createdBy: string | null
  convertedTravelId: number | null
  convertedTravelSlug: string | null
  createdAt: string
  updatedAt: string
}

/* ── 状态 ─────────────────────────────────────────────────────────────── */

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  PLANNING: '规划中',
  CONFIRMED: '已敲定',
  DONE: '已完成',
}

export const PLAN_STATUS_TONES: Record<PlanStatus, BadgeTone> = {
  PLANNING: 'accent',
  CONFIRMED: 'sun',
  DONE: 'neutral',
}

export const PLAN_STATUS_ICONS: Record<PlanStatus, LucideIcon> = {
  PLANNING: Clock,
  CONFIRMED: CheckCircle2,
  DONE: Sparkles,
}

export const PLAN_STATUSES: PlanStatus[] = ['PLANNING', 'CONFIRMED', 'DONE']

export function planStatusLabelOf(status?: string | null): string {
  return (status && PLAN_STATUS_LABELS[status as PlanStatus]) || '规划中'
}

/* ── 清单类型 ─────────────────────────────────────────────────────────── */

export const PLAN_TASK_KINDS: PlanTaskKind[] = ['TODO', 'PACK', 'PLACE']

export const PLAN_TASK_KIND_LABELS: Record<PlanTaskKind, string> = {
  TODO: '待办',
  PACK: '打包',
  PLACE: '想去的地方',
}

export const PLAN_TASK_KIND_SHORT: Record<PlanTaskKind, string> = {
  TODO: '待办',
  PACK: '打包',
  PLACE: '想去',
}

export const PLAN_TASK_KIND_ICONS: Record<PlanTaskKind, LucideIcon> = {
  TODO: CheckCircle2,
  PACK: ShoppingBag,
  PLACE: MapPin,
}

export function planTaskKindOf(kind?: string | null): PlanTaskKind {
  return kind === 'PACK' || kind === 'PLACE' ? kind : 'TODO'
}

/* ── 日期 / 金额 ──────────────────────────────────────────────────────── */

function toDate(iso?: string | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function fmtPlanDate(iso?: string | null): string {
  const d = toDate(iso)
  if (!d) return ''
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/** 起止日期文案：同月省略月份，缺一头就只显示有的那头 */
export function fmtDateRange(start?: string | null, end?: string | null): string {
  const s = toDate(start)
  const e = toDate(end)
  if (!s && !e) return ''
  if (s && !e) return `${fmtPlanDate(start)} 出发`
  if (!s && e) return `${fmtPlanDate(end)} 结束`
  if (!s || !e) return ''
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${fmtPlanDate(start)} – ${e.getDate()}`
  }
  return `${fmtPlanDate(start)} – ${fmtPlanDate(end)}`
}

/** 计划天数（含头含尾）；日期不全或倒挂时返回 null */
export function planDayCount(start?: string | null, end?: string | null): number | null {
  const s = toDate(start)
  const e = toDate(end)
  if (!s || !e) return null
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1
  return days > 0 ? days : null
}

export function fmtBudget(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return ''
  const rounded = Math.round(value)
  return `¥${rounded.toLocaleString('zh-CN')}`
}

/** 清单进度（0-100），空清单返回 0 */
export function planProgress(plan: Pick<SpacePlan, 'taskCount' | 'taskDoneCount'>): number {
  if (!plan.taskCount) return 0
  return Math.round((plan.taskDoneCount / plan.taskCount) * 100)
}

/** 计划详情页地址：静态导出下统一走 query 参数（与 /space/detail?slug= 同思路） */
export function spacePlanDetailHref(spaceSlug: string, planId: number): string {
  return `/space/plans?slug=${encodeURIComponent(spaceSlug)}&plan=${planId}`
}

/** 计划列表页地址 */
export function spacePlansHref(spaceSlug?: string | null): string {
  return spaceSlug ? `/space/plans?slug=${encodeURIComponent(spaceSlug)}` : '/space/plans'
}

/**
 * 从任意异常里取一句可展示的中文提示。
 * 客户端 fetch 封装抛的是 Error；统一走这里，避免每处 catch 都写 `e: any`。
 */
export function errorMessageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}
