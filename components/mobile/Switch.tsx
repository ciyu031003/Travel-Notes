'use client'

import { cn } from '@/lib/utils'
import { hapticLight } from '@/lib/mobile/haptics'

/** iOS 开关：44pt 触达行 + 48×32 轨道，切换带 light 触觉 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  description,
  className,
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  disabled?: boolean
  label?: string
  description?: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || '开关'}
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        void hapticLight()
        onCheckedChange(!checked)
      }}
      className={cn(
        'flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left',
        disabled && 'opacity-50',
        className,
      )}
      style={{
        background: 'var(--m-surface-solid)',
        border: '1px solid var(--m-line)',
      }}
    >
      {(label || description) && (
        <span className="min-w-0">
          {label && (
            <span className="block text-[15px] font-medium text-[var(--m-text)]">{label}</span>
          )}
          {description && (
            <span className="mt-0.5 block text-[12px] leading-snug text-[var(--m-muted)]">
              {description}
            </span>
          )}
        </span>
      )}
      <span
        aria-hidden="true"
        className={cn('m-switch h-8 w-12 shrink-0 rounded-full p-[3px]', checked ? 'is-on' : 'is-off')}
      >
        <span className="m-switch-knob block h-[26px] w-[26px] rounded-full" />
      </span>
    </button>
  )
}
