import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** 空态占位：图形图标 + 标题 + 说明 + 行动按钮 */
export function EmptyState({
  icon: Icon,
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
      {Icon && (
        <div className="m-empty-icon">
          <Icon className="h-8 w-8" strokeWidth={1.6} />
        </div>
      )}
      <h3 className="text-[16px] font-semibold text-[var(--m-text)]">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-[var(--m-muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
