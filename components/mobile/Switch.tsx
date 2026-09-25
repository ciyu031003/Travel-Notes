'use client'

import { cn } from '@/lib/utils'
import { hapticLight } from '@/lib/mobile/haptics'

/**
 * iOS 开关：44pt 触达行 + 48×32 轨道，切换带 light 触觉。
 *
 * M5 升级（API 保持向后兼容）：
 *  · 轨道加内阴影、滑块改过冲缓动（jelly，一次性动画）
 *  · 新增 `bare`：只渲染开关本体，便于放进 ListRow 等自定义排版的右侧
 *  · 行内硬编码的 text-[15px]/text-[12px] 收敛到 m-body/m-caption 字阶
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  description,
  bare = false,
  className,
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  disabled?: boolean
  label?: string
  description?: string
  /** 只渲染开关本体（不带整行容器与文案），用于 ListRow 的 trailing 槽 */
  bare?: boolean
  className?: string
}) {
  const handleToggle = () => {
    if (disabled) return
    void hapticLight()
    onCheckedChange(!checked)
  }

  const track = (
    <span
      aria-hidden="true"
      className={cn(
        'm-switch block h-8 w-12 shrink-0 rounded-full p-[3px]',
        checked ? 'is-on' : 'is-off',
      )}
    >
      <span className="m-switch-knob block h-[26px] w-[26px] rounded-full" />
    </span>
  )

  if (bare) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label || '开关'}
        disabled={disabled}
        onClick={handleToggle}
        className={cn('m-switch-bare m-pressable', disabled && 'opacity-50', className)}
      >
        {track}
      </button>
    )
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || '开关'}
      disabled={disabled}
      onClick={handleToggle}
      className={cn(
        'm-pressable flex min-h-[52px] w-full items-center justify-between gap-3 rounded-[var(--m-radius-card)] px-4 py-2.5 text-left',
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
            <span className="m-body block font-medium text-[var(--m-text)]">{label}</span>
          )}
          {description && (
            <span className="m-caption mt-0.5 block text-[var(--m-muted)]">{description}</span>
          )}
        </span>
      )}
      {track}
    </button>
  )
}

export default Switch
