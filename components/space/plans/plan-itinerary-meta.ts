/**
 * 行程块的类型/时间/金额小工具（纯函数，无 JSX）。
 *
 * 时间约定与 P1a 引擎一致：startAt/endAt 是 ISO 字符串，但**UTC 字段即墙上时间**
 * （服务端用 Date.UTC 落库）。因此这里一律按字符串取，不用 Date 的本地时区换算，
 * 否则跨时区会整体偏移一天/几小时。
 */
import type { LucideIcon } from 'lucide-react'
import { ITINERARY_ICON, ITINERARY_TONE, Sparkles, type BadgeTone, type ItineraryType } from '@/lib/mobile/icon-system'
import type { PlanItemKind } from '@/lib/client/plan-collab-types'

export const PLAN_ITEM_KINDS: PlanItemKind[] = ['TRANSPORT', 'HOTEL', 'FOOD', 'SPOT', 'ACTIVITY', 'FLEX']

export const PLAN_ITEM_KIND_LABEL: Record<PlanItemKind, string> = {
  TRANSPORT: '交通',
  HOTEL: '住宿',
  FOOD: '吃饭',
  SPOT: '景点',
  ACTIVITY: '活动',
  FLEX: '机动',
}

/** 计划块类型 → 图标/色调：直接复用行程图标体系（唯一入口），FLEX 用「机动」 */
const ITINERARY_TYPE_OF: Record<Exclude<PlanItemKind, 'FLEX'>, ItineraryType> = {
  TRANSPORT: 'TRANSPORT',
  HOTEL: 'HOTEL',
  FOOD: 'RESTAURANT',
  SPOT: 'SPOT',
  ACTIVITY: 'ACTIVITY',
}

export const PLAN_ITEM_KIND_ICON: Record<PlanItemKind, LucideIcon> = {
  TRANSPORT: ITINERARY_ICON[ITINERARY_TYPE_OF.TRANSPORT],
  HOTEL: ITINERARY_ICON[ITINERARY_TYPE_OF.HOTEL],
  FOOD: ITINERARY_ICON[ITINERARY_TYPE_OF.FOOD],
  SPOT: ITINERARY_ICON[ITINERARY_TYPE_OF.SPOT],
  ACTIVITY: ITINERARY_ICON[ITINERARY_TYPE_OF.ACTIVITY],
  FLEX: Sparkles,
}

export const PLAN_ITEM_KIND_TONE: Record<PlanItemKind, BadgeTone> = {
  TRANSPORT: ITINERARY_TONE[ITINERARY_TYPE_OF.TRANSPORT],
  HOTEL: ITINERARY_TONE[ITINERARY_TYPE_OF.HOTEL],
  FOOD: ITINERARY_TONE[ITINERARY_TYPE_OF.FOOD],
  SPOT: ITINERARY_TONE[ITINERARY_TYPE_OF.SPOT],
  ACTIVITY: ITINERARY_TONE[ITINERARY_TYPE_OF.ACTIVITY],
  FLEX: 'neutral',
}

export function planItemKindOf(kind?: string | null): PlanItemKind {
  const value = String(kind ?? '').toUpperCase()
  return (PLAN_ITEM_KINDS as string[]).includes(value) ? (value as PlanItemKind) : 'SPOT'
}

/** ISO（UTC 字段=墙上时间）→ 'HH:mm'；没有时间返回 '' */
export function wallTimeLabel(iso?: string | null): string {
  if (!iso) return ''
  const text = String(iso)
  const match = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(text)
  if (match) return match[1]
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${String(parsed.getUTCHours()).padStart(2, '0')}:${String(parsed.getUTCMinutes()).padStart(2, '0')}`
}

/** ISO → <input type="datetime-local"> 的 value（'YYYY-MM-DDTHH:mm'） */
export function wallTimeInputValue(iso?: string | null): string {
  if (!iso) return ''
  const text = String(iso)
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(text)
  if (match) return `${match[1]}T${match[2]}`
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${parsed.toISOString().slice(0, 10)}T${parsed.toISOString().slice(11, 16)}`
}

/** datetime-local 的值 + 当天日期 → 服务端可解析的墙上时间字符串；空值返回 null */
export function wallTimeFromInput(value: string, fallbackDate?: string | null): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) return trimmed.slice(0, 16)
  if (/^\d{2}:\d{2}$/.test(trimmed) && fallbackDate) return `${fallbackDate}T${trimmed}`
  return null
}

/** 'YYYY-MM-DD' → { month: 12, day: 6, weekday: 周日 }（按 UTC 计算，避免时区偏移） */
export function dayDateParts(date?: string | null): { month: number; day: number; weekday: string } | null {
  if (!date) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date))
  if (!match) return null
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (Number.isNaN(d.getTime())) return null
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return { month: Number(match[2]), day: Number(match[3]), weekday: weekdays[d.getUTCDay()] }
}

/** '12月6日' */
export function dayDateLabel(date?: string | null): string {
  const parts = dayDateParts(date)
  return parts ? `${parts.month}月${parts.day}日` : ''
}

/** '12月6日 · 周日' */
export function dayDateWeekLabel(date?: string | null): string {
  const parts = dayDateParts(date)
  return parts ? `${parts.month}月${parts.day}日 · ${parts.weekday}` : ''
}

/** 金额（分）→ '¥146' / '¥146.50' */
export function moneyLabel(cents?: number | null): string {
  if (cents == null || !Number.isFinite(cents)) return ''
  const yuan = cents / 100
  return Number.isInteger(yuan) ? `¥${yuan.toLocaleString('zh-CN')}` : `¥${yuan.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** 金额输入框的文本值：元，最多两位小数（空 = 未填） */
export function centsToYuanText(cents?: number | null): string {
  if (cents == null || !Number.isFinite(cents)) return ''
  const yuan = cents / 100
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2)
}

/** 元文本 → 分；非法或空返回 null */
export function yuanTextToCents(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount < 0) return null
  return Math.round(amount * 100)
}

/** 天序（0 基）→ 'Day 1' */
export function dayShortLabel(index: number): string {
  return `Day ${index + 1}`
}

/** 该天是否落在计划的起止日期之外（引擎最多 30 天，历史计划可能没有日期） */
export function isDateWithinPlan(date: string | null | undefined, start?: string | null, end?: string | null): boolean {
  if (!date || !start || !end) return true
  const d = date.slice(0, 10)
  return d >= start.slice(0, 10) && d <= end.slice(0, 10)
}
