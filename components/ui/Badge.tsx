import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'default' | 'accent' | 'neutral'

const tones: Record<Tone, string> = {
  default:
    'bg-travel-sakura/50 text-travel-accentStrong dark:bg-travel-accent/20 dark:text-travel-accentSoft',
  accent:
    'bg-travel-accent/10 text-travel-accent dark:bg-travel-accent/20 dark:text-travel-bloom',
  neutral:
    'bg-white/70 text-travel-ink/70 border border-travel-line/60 dark:bg-white/5 dark:text-shell-muted dark:border-shell-line',
}

/** 统一胶囊标签/章节 eyebrow。 */
export default function Badge({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
