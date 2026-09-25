'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hapticSelection } from '@/lib/mobile/haptics'
import { Icon } from './Icon'

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

  return (
    <div role="tablist" aria-label="分段选择" className={cn('m-seg', className)} style={style}>
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
      <span
        aria-hidden="true"
        className="m-seg-thumb"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
    </div>
  )
}

export default SegmentedControl
