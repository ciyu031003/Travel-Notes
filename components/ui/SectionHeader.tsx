import type { ReactNode } from 'react'

/** 页面/区块统一标题：小写 eyebrow + 主标题 + 可选副标题。 */
export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  action,
  className,
}: {
  eyebrow?: string
  title: ReactNode
  subtitle?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1 ${className || ''}`}>
      <div className="flex items-end justify-between gap-4">
        <div>
          {eyebrow && (
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-travel-accent dark:text-travel-bloom">
              {eyebrow}
            </p>
          )}
          <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-travel-inkStrong dark:text-[#F1EFEA] md:text-2xl">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {subtitle && (
        <p className="mt-1 text-sm leading-relaxed text-travel-ink/70 dark:text-shell-muted">
          {subtitle}
        </p>
      )}
    </div>
  )
}
