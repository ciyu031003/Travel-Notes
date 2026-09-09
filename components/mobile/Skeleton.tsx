import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

/** 基础骨架块（shimmer，aria-hidden，防 CLS 占位） */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" className={cn('m-skeleton', className)} style={style} />
}

/** 文本行骨架：行宽错落（100% / 92% / 78% 循环） */
export function SkeletonLines({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div aria-hidden="true" className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className="h-3 w-full" style={{ width: [100, 92, 78][index % 3] + '%' }} />
      ))}
    </div>
  )
}

/** 卡片骨架（封面 + 标题行 + 文字行），移动端常见占位形态 */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('m-card p-4', className)} aria-hidden="true">
      <Skeleton className="h-40 w-full" />
      <SkeletonLines lines={2} className="mt-3.5" />
    </div>
  )
}
