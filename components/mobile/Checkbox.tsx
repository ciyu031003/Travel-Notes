'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { hapticSelection } from '@/lib/mobile/haptics'

/**
 * 勾选框（M5 新增）
 * ---------------------------------------------------------------------------
 * 参考 Uiverse「Checkboxes」分类里的"勾线绘制"手法（stroke-dashoffset 一次性
 * 动画），但按本项目 token 重写。
 *
 * 用途：相册多选照片、行程项完成、打包清单。
 *  · 整行可点（带 label/description 时行高 ≥56px），或 `bare` 只渲染方块
 *  · role="checkbox" + aria-checked；触觉 hapticSelection
 *  · 勾线动画在 mobile.css 的 prefers-reduced-motion 列表内
 */
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  /** 只渲染勾选方块本身（用于自行排版的密集列表） */
  bare = false,
  className,
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
  bare?: boolean
  className?: string
}) {
  const box = (
    <span className={cn('m-check', checked && 'is-on', disabled && 'is-disabled')} aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          className="m-check-path"
          d="M2.5 7.4 5.6 10.5 11.5 3.8"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )

  if (bare) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : '选择'}
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          void hapticSelection()
          onCheckedChange(!checked)
        }}
        className={cn(
          'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full',
          'm-pressable focus-visible:outline-none',
          className,
        )}
      >
        {box}
      </button>
    )
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        void hapticSelection()
        onCheckedChange(!checked)
      }}
      className={cn(
        'm-pressable flex min-h-[56px] w-full items-start gap-3 rounded-[var(--m-radius-control)] px-4 py-3 text-left',
        'focus-visible:outline-none',
        disabled && 'opacity-50',
        className,
      )}
      style={{ background: 'var(--m-surface-solid)', border: '1px solid var(--m-line)' }}
    >
      <span className="pt-0.5">{box}</span>
      {(label || description) && (
        <span className="min-w-0 flex-1">
          {label && (
            <span className="m-body block font-medium text-[var(--m-text)]">{label}</span>
          )}
          {description && (
            <span className="m-caption mt-0.5 block text-[var(--m-muted)]">{description}</span>
          )}
        </span>
      )}
    </button>
  )
}

export default Checkbox
