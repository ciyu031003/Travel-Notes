'use client'

import { cn } from '@/lib/utils'

interface PixelBadgeProps {
  children: React.ReactNode
  className?: string
}

/**
 * 像素小标签：日期 / 地点 / DAY 计数等记忆符号。
 * 仅用于短标签，不做正文容器。
 */
export default function PixelBadge({ children, className }: PixelBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border border-black bg-pixel-panel px-1.5 py-0.5 font-zpix text-xs leading-none text-album-accent',
        className
      )}
    >
      {children}
    </span>
  )
}
