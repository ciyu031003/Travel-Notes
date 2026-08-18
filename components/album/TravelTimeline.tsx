'use client'

import { cn } from '@/lib/utils'

export interface TravelTimelineItem {
  label?: string
  title: string
  subtitle?: string
}

interface TravelTimelineProps {
  items: TravelTimelineItem[]
  className?: string
}

/**
 * 旅行时间线（像素节点）：
 * 日期 / 地点用像素符号，正文用 sans。只承载时间节点，不做大装饰带。
 */
export default function TravelTimeline({ items, className }: TravelTimelineProps) {
  if (!items || items.length === 0) return null
  return (
    <ol className={cn('relative space-y-3 pl-4', className)}>
      <span className="absolute left-[5px] top-1 bottom-1 w-px bg-album-accent/25" aria-hidden="true" />
      {items.map((item, i) => (
        <li key={`${item.title}-${i}`} className="relative pl-5">
          <span className="absolute left-[-7px] top-1.5 h-3 w-3 rounded-[2px] border border-black bg-album-accent" aria-hidden="true" />
          {item.label && (
            <p className="font-zpix text-xs tracking-wider text-album-accent">{item.label}</p>
          )}
          <p className="mt-0.5 text-sm font-semibold text-album-text1">{item.title}</p>
          {item.subtitle && <p className="mt-0.5 text-xs text-album-text2">{item.subtitle}</p>}
        </li>
      ))}
    </ol>
  )
}
