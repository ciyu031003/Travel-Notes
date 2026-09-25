'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hapticSelection } from '@/lib/mobile/haptics'
import { Icon } from './Icon'

/**
 * 卡片式单选（M5 新增）
 * ---------------------------------------------------------------------------
 * 参考 Uiverse「Radio-buttons」分类里的 radio-card 手法（整块可选 + 选中态
 * 边线加粗 + 勾标入场），按本项目 token 重写。
 *
 * 用途：旅行关系（独旅/情侣/家庭…）、同步策略、相册模式等「带说明的多选一」。
 * 相比原生 radio，它能在同一块里表达「标题 + 一句解释 + 图标」，且触达远大于 44px。
 */
export function ChoiceCard({
  selected,
  onSelect,
  title,
  description,
  icon,
  disabled = false,
  className,
}: {
  selected: boolean
  onSelect: () => void
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={() => {
        if (disabled || selected) return
        void hapticSelection()
        onSelect()
      }}
      className={cn('m-choice', selected && 'is-on', className)}
    >
      {icon && (
        <span
          className={cn(
            'flex h-10 w-10 flex-none items-center justify-center rounded-[14px]',
            selected
              ? 'text-[var(--m-accent-strong)]'
              : 'text-[var(--m-muted)]',
          )}
          style={{
            background: selected ? 'var(--m-accent-soft)' : 'var(--m-surface-2)',
          }}
        >
          <Icon icon={icon} size="md" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="m-body block font-semibold text-[var(--m-text)]">{title}</span>
        {description && (
          <span className="m-caption mt-0.5 block text-[var(--m-muted)]">{description}</span>
        )}
      </span>
      <span className="m-choice-mark" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <path
            d="M2.5 7.4 5.6 10.5 11.5 3.8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  )
}

/** 一组互斥选项的容器（带 role="radiogroup" 与可选分组标题） */
export function ChoiceGroup({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label?: string
  value: string
  options: Array<{
    value: string
    title: ReactNode
    description?: ReactNode
    icon?: LucideIcon
    disabled?: boolean
  }>
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-col gap-2', className)}>
      {options.map((o) => (
        <ChoiceCard
          key={o.value}
          selected={o.value === value}
          onSelect={() => onChange(o.value)}
          title={o.title}
          description={o.description}
          icon={o.icon}
          disabled={o.disabled}
        />
      ))}
    </div>
  )
}

export default ChoiceCard
