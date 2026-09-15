'use client'

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hapticLight } from '@/lib/mobile/haptics'
import { Icon } from './Icon'
import type { IconTone } from '@/lib/mobile/icon-system'

/**
 * 图标按钮：保证 44×44 最小触达，统一 4 种外观。
 *
 * 替代重构前手写的 `w-9 h-9` / `w-10 h-10`（TravelClient 里 4 处、
 * 相册顶栏多处）—— 那些尺寸不足 44px，达不到无障碍最小触达标准。
 *
 * 用法：
 *   <IconButton icon={X} label="关闭" onClick={onClose} />
 *   <IconButton icon={ChevronLeft} label="收起面板" variant="glass" />
 */
const VARIANT_CLASS: Record<'plain' | 'surface' | 'glass' | 'accent', string> = {
  plain: 'text-[var(--m-muted)] active:bg-[var(--m-surface-2)]',
  surface: 'bg-[var(--m-surface-solid)] border border-[var(--m-line)] text-[var(--m-text)]',
  glass: 'm-glass text-[var(--m-text)]',
  accent: 'bg-[var(--m-accent)] text-white',
}

export function IconButton({
  icon,
  label,
  onClick,
  variant = 'surface',
  tone,
  size = 'md',
  className,
  disabled,
  type = 'button',
}: {
  icon: LucideIcon
  /** 无障碍标签（必填，图标按钮没有可见文字） */
  label: string
  onClick?: () => void
  variant?: 'plain' | 'surface' | 'glass' | 'accent'
  tone?: IconTone
  size?: 'sm' | 'md'
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      onPointerDown={() => void hapticLight()}
      className={cn(
        'm-pressable inline-flex flex-none items-center justify-center rounded-full',
        // 44px 最小触达：视觉可小，热区不可小
        'min-h-11 min-w-11',
        size === 'sm' ? 'h-11 w-11' : 'h-11 w-11',
        VARIANT_CLASS[variant],
        disabled && 'opacity-40',
        className,
      )}
    >
      <Icon icon={icon} size={size === 'sm' ? 'sm' : 'md'} tone={tone} />
    </button>
  )
}

export default IconButton
