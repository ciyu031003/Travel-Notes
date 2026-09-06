import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'default' | 'accent' | 'neutral'

const tones: Record<Tone, string> = {
  default:
    'bg-semantic-accentWeak text-semantic-accentStrong',
  accent:
    'bg-semantic-accentWeak text-semantic-accent',
  neutral:
    'bg-semantic-surface2 text-semantic-muted border border-semantic-line',
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
