import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BADGE_TONE_CLASS, type BadgeTone, type IconSize } from '@/lib/mobile/icon-system'
import { Icon } from './Icon'

/**
 * 图标徽标：暖色调、圆润的图标容器。
 *
 * 替代重构前散落的硬编码彩色方块（如 HomeMobile 里三处
 * `bg-[#F7E6D9]` / `bg-[#E7F1F5]` / `bg-[#EAF0E9]`），
 * 那些颜色既不在 token 体系内，暗色模式下也无法适配。
 *
 * 用法：
 *   <IconBadge icon={CalendarDays} tone="accent" />
 *   <IconBadge icon={Volleyball} tone="blush" size="lg" shape="circle" />
 *
 * 设计约定：图标本身保持 md（20px），靠容器尺寸提供视觉重量 ——
 * 这是"图标忽大忽小"的根治办法。
 */
const BOX_CLASS: Record<IconSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
}

const RADIUS_CLASS: Record<IconSize, string> = {
  sm: 'rounded-[10px]',
  md: 'rounded-[14px]',
  lg: 'rounded-[16px]',
}

export function IconBadge({
  icon,
  tone = 'accent',
  size = 'md',
  shape = 'squircle',
  className,
  label,
}: {
  icon: LucideIcon
  /** 暖色色调，默认陶土 accent */
  tone?: BadgeTone
  size?: IconSize
  /** squircle（圆角方形，默认）或 circle（正圆） */
  shape?: 'squircle' | 'circle'
  className?: string
  label?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center justify-center',
        BOX_CLASS[size],
        shape === 'circle' ? 'rounded-full' : RADIUS_CLASS[size],
        BADGE_TONE_CLASS[tone],
        className,
      )}
    >
      <Icon icon={icon} size={size === 'lg' ? 'md' : size} label={label} />
    </span>
  )
}

export default IconBadge
