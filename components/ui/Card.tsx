import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** 统一卡片容器（对齐 .card：暖米白 + 暖边框 + 圆角 2xl + 柔和阴影；暗色 shell-surface） */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-semantic-line bg-semantic-surface p-5 shadow-soft',
        className
      )}
      {...props}
    />
  )
}
