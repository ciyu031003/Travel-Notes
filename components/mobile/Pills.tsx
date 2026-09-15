import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ACTIVITY_ICON,
  ACTIVITY_LABELS,
  ACTIVITY_TONE,
  BADGE_TONE_CLASS,
  itineraryIconOf,
  itineraryLabelOf,
  itineraryToneOf,
  travelTypeIconOf,
  travelTypeLabelOf,
  travelTypeToneOf,
  type ActivityKind,
  type BadgeTone,
} from '@/lib/mobile/icon-system'
import { Icon } from './Icon'

/**
 * 暖色圆润胶囊 —— 「图标 + 文字」的语义标签。
 *
 * 补齐重构前的两处缺口：
 *   1. 旅行关系类型（独旅/情侣/家庭…）此前是纯文字 pill，没有图标
 *   2. 行程项类型（景点/餐厅/住宿/交通/活动/其他）此前被统一硬编码成 MapPin
 */

const SIZE_CLASS = {
  sm: 'h-6 gap-1 px-2 text-[11px]',
  md: 'h-7 gap-1.5 px-2.5 text-[13px]',
} as const

export function Pill({
  icon,
  tone = 'neutral',
  children,
  size = 'md',
  className,
}: {
  icon?: LucideIcon
  tone?: BadgeTone
  children: React.ReactNode
  size?: keyof typeof SIZE_CLASS
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center rounded-full font-semibold',
        SIZE_CLASS[size],
        BADGE_TONE_CLASS[tone],
        className,
      )}
    >
      {icon && <Icon icon={icon} size="sm" />}
      {children}
    </span>
  )
}

/** 旅行关系类型：独旅 / 情侣 / 家庭 / 朋友 / 闺蜜兄弟 / 结伴 / 其他 */
export function TravelTypePill({
  type,
  size = 'md',
  className,
}: {
  type?: string | null
  size?: keyof typeof SIZE_CLASS
  className?: string
}) {
  if (!type) return null
  return (
    <Pill icon={travelTypeIconOf(type)} tone={travelTypeToneOf(type)} size={size} className={className}>
      {travelTypeLabelOf(type)}
    </Pill>
  )
}

/** 活动类型：球类运动 / 徒步 / 散步 / 骑行 / 游泳 / 登山 / 滑雪 / 露营 … */
export function ActivityPill({
  kind,
  size = 'md',
  className,
}: {
  kind: ActivityKind
  size?: keyof typeof SIZE_CLASS
  className?: string
}) {
  return (
    <Pill icon={ACTIVITY_ICON[kind]} tone={ACTIVITY_TONE[kind]} size={size} className={className}>
      {ACTIVITY_LABELS[kind]}
    </Pill>
  )
}

/** 行程项：按 ItineraryItem.type 自动选图标与色调 */
export function ItineraryChip({
  type,
  locationName,
  children,
  size = 'md',
  className,
}: {
  type?: string | null
  locationName?: string | null
  children: React.ReactNode
  size?: keyof typeof SIZE_CLASS
  className?: string
}) {
  return (
    <Pill
      icon={itineraryIconOf(type)}
      tone={itineraryToneOf(type)}
      size={size}
      className={className}
    >
      {children}
      {locationName ? `（${locationName}）` : ''}
      <span className="sr-only">{itineraryLabelOf(type)}</span>
    </Pill>
  )
}
