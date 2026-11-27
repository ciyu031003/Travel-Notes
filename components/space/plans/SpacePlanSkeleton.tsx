'use client'

import { cn } from '@/lib/utils'

/**
 * 旅行计划加载骨架（U1）。
 *
 * 为什么要它：计划区块是**自取数**的独立区块（不是页面级 loading），此前用一圈
 * 转圈 Loader —— 从空间详情滚到计划区块时，会先看到一朵转圈再"啪"地换成卡片，
 * 高度也从 ~40px 跳到 ~200px。骨架与真实计划卡同构（图标块 + 两行文字 + 进度条），
 * 高度基本一致，内容出现时不会把下面的区块顶下去。
 *
 * 复用 .m-skeleton（自带 shimmer，且已在 mobile.css 的减少动效清单里）。
 * 无障碍：外层 role="status" + 一行 sr-only 文案，屏幕阅读器不会读到一堆空盒子。
 */
export function SpacePlanSkeleton({ rows = 2, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">正在加载旅行计划…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          // 骨架是静态占位，用索引 key 不会引发列表重排问题
          key={i}
          className="rounded-2xl bg-[var(--ui-social-surface)] p-3.5 ring-1 ring-[var(--ui-space-hairline)]"
        >
          <div className="flex items-start gap-3">
            <span className="m-skeleton block h-10 w-10 flex-none rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <span className="m-skeleton block h-4 w-3/5" />
              <span className="m-skeleton block h-3 w-2/5" />
            </div>
            <span className="m-skeleton block h-6 w-14 flex-none rounded-full" />
          </div>
          <span className="m-skeleton mt-3 block h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  )
}

export default SpacePlanSkeleton
