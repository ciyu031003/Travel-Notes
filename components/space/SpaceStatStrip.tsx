'use client'

import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/mobile/Icon'
import { SPACE_DUR } from './space-motion'

export interface SpaceStatItem {
  label: string
  value: number
  icon: LucideIcon
}

/**
 * 数字滚动（U1）。
 *
 * 为什么没直接用 components/mobile/CountUp：那个实现把"上一帧的终值"存在 ref 里，
 * 而 dev 的 reactStrictMode 会把 mount effect 跑两遍 —— 第二遍拿到的 from 已经是
 * 终值（3 → 3），于是开发环境根本看不到滚动（生产环境正常）。这里多一条判据：
 * **from === value 时视为"刚挂载"、从 0 重新起跳**，真实值变化时（3 → 4）仍从旧值滚到新值。
 *
 * 无障碍：prefers-reduced-motion 直接显示终值；SSR 首帧也显示终值（不会先闪 0）。
 */
function StatCountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef<number | null>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fromRef.current = value
      setDisplay(value)
      return
    }
    const from = fromRef.current === value ? 0 : (fromRef.current ?? 0)
    fromRef.current = value
    const durationMs = SPACE_DUR.slow * 1000 * 2 // 720ms：比 360ms 的区块动效稍长，数字"滚"得完
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value])

  return <span>{display}</span>
}

/**
 * 空间统计条（S2 重构新增 · U1 补数字滚动）。
 *
 * 位置：压在 Hero 圆角下沿（-mt-5），是页面唯一的「浮起一张纸」，
 * 用来把 Hero 与正文分开 —— 一屏里只允许一层抬升，多了就脏。
 *
 * 视觉：四格 + 竖向发丝线分隔，不画四个独立小卡（四个小卡会让页面像仪表盘）。
 * 数字用空间主题色（类型身份只在这里和 Hero 出现），标签保持中性 faint。
 */
export function SpaceStatStrip({
  items,
  className,
}: {
  items: SpaceStatItem[]
  className?: string
}) {
  return (
    <div
      className={cn(
        'm-card-raised grid grid-cols-4 divide-x divide-[var(--ui-social-line)] rounded-[var(--m-radius-card)] py-3',
        className,
      )}
    >
      {items.map(({ label, value, icon }) => (
        <div key={label} className="flex min-w-0 flex-col items-center px-1">
          <Icon icon={icon} size="sm" className="text-[var(--ui-space-accent-strong)] opacity-75" />
          <span className="mt-1 w-full truncate text-center text-[18px] font-semibold leading-5 tabular-nums text-[var(--ui-space-accent-strong)]">
            <StatCountUp value={value} />
          </span>
          <span className="mt-0.5 text-[11px] leading-4 text-[var(--ui-social-faint)]">{label}</span>
        </div>
      ))}
    </div>
  )
}

export default SpaceStatStrip
