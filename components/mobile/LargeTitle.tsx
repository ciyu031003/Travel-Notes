import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** iOS 大标题：28pt 粗题 + 可选副标题（顶部安全区由页面容器负责） */
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
        <h1 className="truncate text-[28px] font-bold leading-8 tracking-[-0.02em] text-[var(--m-text)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-[13px] leading-snug text-[var(--m-muted)]">{subtitle}</p>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </header>
  )
}
