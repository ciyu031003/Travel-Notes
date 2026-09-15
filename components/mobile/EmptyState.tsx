import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './Icon'

/** 空态占位：图标 + 标题 + 说明 + 行动按钮 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('m-empty', className)}>
      {icon && (
        <div className="m-empty-icon">
          {/* 统一走图标体系：原先此处硬编码 strokeWidth 1.6，
              与默认 2、导航激活 2.4 并存 → 同屏三种描边粗细 */}
          <Icon icon={icon} size="lg" />
        </div>
      )}
      <h3 className="m-title-2 text-[var(--m-text)]">{title}</h3>
      {description && (
        <p className="m-caption mt-1.5 max-w-[260px] text-[var(--m-muted)]">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
