import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/mobile/Icon'

export interface SpaceStatItem {
  label: string
  value: number
  icon: LucideIcon
}

/**
 * 空间统计条（S2 重构新增）。
 *
 * 位置：压在 Hero 圆角下沿（-mt-5），是页面唯一的「浮起一张纸」，
 * 用来把 Hero 与正文分开 —— 一屏里只允许一层抬升，多了就脏。
 *
 * 视觉：四格 + 竖向发丝线分隔，不画四个独立小卡（四个小卡会让页面像仪表盘）。
 * 数字用空间主题色（类型身份只在这里和 Hero 出现），标签保持中性 faint。
 */
export function SpaceStatStrip({
  items,
  className,
}: {
  items: SpaceStatItem[]
  className?: string
}) {
  return (
    <div
      className={cn(
        'm-card-raised grid grid-cols-4 divide-x divide-[var(--ui-social-line)] rounded-[var(--m-radius-card)] py-3',
        className,
      )}
    >
      {items.map(({ label, value, icon }) => (
        <div key={label} className="flex min-w-0 flex-col items-center px-1">
          <Icon icon={icon} size="sm" className="text-[var(--ui-space-accent-strong)] opacity-75" />
          <span className="mt-1 w-full truncate text-center text-[18px] font-semibold leading-5 tabular-nums text-[var(--ui-space-accent-strong)]">
            {value}
          </span>
          <span className="mt-0.5 text-[11px] leading-4 text-[var(--ui-social-faint)]">{label}</span>
        </div>
      ))}
    </div>
  )
}

export default SpaceStatStrip
