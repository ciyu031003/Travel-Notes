'use client'

import { cn } from '@/lib/utils'

interface AlbumDayDividerProps {
  day: number | string
  label?: string
  className?: string
}

/**
 * 相册 DAY 分隔符：像素记忆符号 + mono 数字。
 * 只承担"时间节点"语义，不作为大装饰带。
 */
export default function AlbumDayDivider({ day, label, className }: AlbumDayDividerProps) {
  return (
    <div
      className={cn('flex items-center gap-3 select-none', className)}
      role="separator"
      aria-label={`Day ${day}${label ? ` · ${label}` : ''}`}
    >
      <span className="h-px flex-1 bg-album-accent/25" />
      <span className="font-zpix text-xs tracking-[0.2em] text-album-accent">
        ✦ DAY {String(day).padStart(2, '0')}
        {label ? ` · ${label}` : ''} ✦
      </span>
      <span className="h-px flex-1 bg-album-accent/25" />
    </div>
  )
}
