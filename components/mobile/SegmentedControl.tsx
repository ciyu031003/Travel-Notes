'use client'

import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { hapticSelection } from '@/lib/mobile/haptics'

export interface SegmentOption<T extends string> {
  value: T
  label: string
}

/** iOS 分段选择器：tint 滑块随选中项滑动（transform 合成，无宽度动画） */
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
    <div
      role="tablist"
      aria-label="分段选择"
      className={cn('m-seg', className)}
      style={style}
    >
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
            {option.label}
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
