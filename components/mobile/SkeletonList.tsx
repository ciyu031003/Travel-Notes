'use client'

import { cn } from '@/lib/utils'

/**
 * 列表骨架屏（2026-10-16 · ui-ux-pro-max「Loading States / Loading Indicators」）
 * ============================================================================
 * 技能清单（两条 High）：
 *  · Show feedback during async operations —— Don't: leave UI frozen with no feedback
 *  · Show spinner/skeleton for operations > 300ms —— Don't: blank screen while loading
 *
 * 此前这些列表加载时只有一行「加载中…」文本，内容区是一片空白；
 * 骨架屏能让用户先看到"即将出现的结构"（几行几列），等待感明显更低，
 * 也避免内容回来时页面高度突然跳动（技能：content-jumping）。
 *
 * 复用既有的 .m-skeleton（内含 shimmer 动画，且已在 prefers-reduced-motion 降级列表内）。
 */
export function SkeletonRows({
  rows = 4,
  avatar = true,
  className,
}: {
  rows?: number
  /** 是否显示左侧头像位（评论、关注列表这类有头像的用） */
  avatar?: boolean
  className?: string
}) {
  return (
    <div className={cn("space-y-4 py-3", className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          {avatar && <div className="m-skeleton h-9 w-9 flex-none rounded-full" />}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="m-skeleton h-3 rounded-full" style={{ width: "38%" }} />
            <div className="m-skeleton h-3 rounded-full" style={{ width: "88%" }} />
            <div className="m-skeleton h-3 rounded-full" style={{ width: "62%" }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 卡片网格骨架（画册 / 时间线这类以图为主的列表） */
export function SkeletonGrid({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-3 gap-2 py-2", className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="m-skeleton aspect-square rounded-2xl" />
      ))}
    </div>
  )
}

export default SkeletonRows
