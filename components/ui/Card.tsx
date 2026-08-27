import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** 统一卡片容器（对齐 .card：暖米白 + 暖边框 + 圆角 2xl + 柔和阴影；暗色 shell-surface） */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-travel-line/70 bg-white/70 p-5 shadow-soft dark:border-shell-line dark:bg-shell-surface',
        className
      )}
      {...props}
    />
  )
}
