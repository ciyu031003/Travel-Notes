import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ICON_SIZE, ICON_STROKE, type IconSize, type IconTone } from '@/lib/mobile/icon-system'

/**
 * 统一图标组件 —— 全站图标的唯一入口。
 *
 * 为什么需要它：重构前全站 75 处直接使用 lucide，导致同屏出现 9 档尺寸、
 * 4 种描边、多处裸 hex 上色。本组件把「尺寸/描边/颜色」三件事锁死，
 * 组件内不再出现 h-3/h-3.5/h-5/h-7/h-9 之类的自由取值。
 *
 * 用法：
 *   <Icon icon={MapPin} />                          // 默认 md / 继承文字色
 *   <Icon icon={Route} size="sm" tone="muted" />
 *   <Icon icon={Heart} size="lg" tone="accent" label="纪念日" />
 *
 * 需要更大的视觉重量时，请放大容器（IconBadge），不要放大图标。
 */
const TONE_CLASS: Record<IconTone, string> = {
  inherit: '',
  text: 'text-[var(--m-text)]',
  muted: 'text-[var(--m-muted)]',
  faint: 'text-[var(--m-faint)]',
  accent: 'text-[var(--m-accent)]',
  inverse: 'text-white',
  success: 'text-[var(--m-success)]',
  warning: 'text-[var(--m-warning)]',
  danger: 'text-[var(--m-danger)]',
}

export interface IconProps {
  icon: LucideIcon
  /** 仅 3 档：sm 16 / md 20 / lg 24。默认 md。 */
  size?: IconSize
  tone?: IconTone
  className?: string
  /**
   * 逃生舱：仅在「颜色来自 JS 常量/调色板声明（无法用 className 表达）」时使用。
   * 常规场景请用 tone 或 className 的颜色类，不要用 style。
   */
  style?: CSSProperties
  /** 有语义时传文案（无障碍）；不传则视为装饰性图标并对读屏隐藏 */
  label?: string
}

export function Icon({ icon: IconComponent, size = 'md', tone = 'inherit', className, style, label }: IconProps) {
  const px = ICON_SIZE[size]
  return (
    <IconComponent
      width={px}
      height={px}
      strokeWidth={ICON_STROKE[size]}
      className={cn('m-icon', `m-icon-${size}`, TONE_CLASS[tone], className)}
      style={style}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  )
}

export default Icon
