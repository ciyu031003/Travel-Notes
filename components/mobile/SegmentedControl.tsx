'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { hapticSelection } from '@/lib/mobile/haptics'
import { Icon } from './Icon'
import { LiquidGlass } from '@/components/ui/liquid-glass'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  /** 可选图标（M5 新增）：走 Icon 体系，尺寸固定 sm，与 13px 文字基线对齐 */
  icon?: LucideIcon
  /** 可选角标（如未读数） */
  badge?: ReactNode
}

/**
 * iOS 分段选择器：tint 滑块随选中项滑动（transform 合成，无宽度动画）。
 *
 * M5 升级：
 *  · 支持每项图标与角标
 *  · 命中区从 36px 提到 44px（规范 §8 触达下限）
 *  · 滑块投影改 --m-elev-1，滑动缓动改 --m-ease-spring
 *  · 滑块动画已纳入 prefers-reduced-motion 降级
 *
 * 2026-11-24（液态玻璃）：外壳换成 `LiquidGlass`（SVG 折射 + backdrop-filter，
 * Chromium 内真折射、其余浏览器自动退化为磨砂）。滑块由 CSS transform 改为
 * motion spring（`animate` 只动 x，仍是合成层），并加了一层高光边框，
 * 让"切换"这件事在玻璃面上有明确的物理反馈。
 * 组件 API 与可用性完全不变：role=tablist/tab、aria-selected、44px 命中区、
 * 震动反馈、reduced-motion 降级全部保留。
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  className?: string
}) {
  const index = Math.max(0, options.findIndex((option) => option.value === value))
  const style = { '--m-seg-count': options.length } as CSSProperties
  const reduceMotion = useReducedMotion()

  return (
    <LiquidGlass
      radius={14}
      bevelDepth={10}
      scale={22}
      aberration={2.5}
      frost={0.3}
      tint={0.2}
      idleOnly
      className={cn('p-[4px] ring-1 ring-[var(--m-line)]', className)}
      contentClassName="relative"
    >
      <div role="tablist" aria-label="分段选择" className="m-seg m-seg--glass" style={style}>
        <motion.span
          aria-hidden="true"
          className="m-seg-thumb"
          initial={false}
          animate={{ x: `${index * 100}%` }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }
          }
        />
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => {
                if (!active) {
                  void hapticSelection()
                  onChange(option.value)
                }
              }}
              className={cn('m-seg-item', active && 'is-active')}
            >
              {option.icon && <Icon icon={option.icon} size="sm" />}
              <span className="truncate">{option.label}</span>
              {option.badge}
            </button>
          )
        })}
      </div>
    </LiquidGlass>
  )
}

export default SegmentedControl
