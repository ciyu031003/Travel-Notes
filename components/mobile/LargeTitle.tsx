import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** iOS 大标题：24pt 粗题 + 可选副标题（顶部安全区由页面容器负责） */
export function LargeTitle({
  title,
  subtitle,
  trailing,
  className,
}: {
  title: string
  subtitle?: string
  trailing?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('m-title', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="m-title-1 truncate text-[var(--m-text)]">{title}</h1>
        {subtitle && (
          <p className="m-caption mt-1.5 text-[var(--m-muted)]">{subtitle}</p>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </header>
  )
}
