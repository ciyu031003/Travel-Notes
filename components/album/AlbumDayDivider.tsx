'use client'

import { cn } from '@/lib/utils'

interface AlbumDayDividerProps {
  day: number | string
  label?: string
  className?: string
}

/**
 * 相册 DAY 分隔符：只承担"时间节点"语义，不作为装饰带。
 *
 * 修订：原先两端用字符 "✦" 装饰。字符字形依赖字体覆盖（像素字体 zpix
 * 未必含 U+2726，会回退到系统字体 → 跨端不一致、无法对齐、无法控制粗细）。
 * 现直接移除装饰字符，改由发丝线 + 字距表达节奏。
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
        DAY {String(day).padStart(2, '0')}
        {label ? ` · ${label}` : ''}
      </span>
      <span className="h-px flex-1 bg-album-accent/25" />
    </div>
  )
}
