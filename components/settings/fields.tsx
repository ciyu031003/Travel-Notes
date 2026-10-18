'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { KeyRound, Eye, EyeOff, Save } from '@/lib/mobile/icon-system'
import { cn } from '@/lib/utils'

/**
 * 后台设置页共享的表单原子（P2-32）。
 *
 * 为什么抽这些：5 个 Tab 里有 8 个输入框、4 个提交按钮，样式串逐字重复了上百行；
 * 抽成原子后各 Tab 只剩「状态 + 提交逻辑 + 字段组合」，单文件行数才能落到 220 以内。
 * 样式串与拆分前逐字一致（含 disabled/密码框右侧内边距的差异），视觉零变化。
 */

const LABEL_CLASS = 'block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2'
const INPUT_BASE_CLASS =
  'w-full py-2.5 bg-warm-50 dark:bg-warm-700 border border-warm-300 dark:border-warm-600 rounded-lg text-warm-900 dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'
const INPUT_DISABLED_CLASS =
  'w-full pl-10 pr-4 py-2.5 bg-warm-100 dark:bg-warm-700 border border-warm-200 dark:border-warm-600 rounded-lg text-warm-500 dark:text-warm-400'
const HINT_CLASS = 'mt-1 text-xs text-warm-500 dark:text-warm-400'

/** 每个 Tab 统一的标题 + 说明 */
export function FormSection({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-warm-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm text-warm-500 dark:text-warm-400">{description}</p>
    </div>
  )
}

interface TextFieldProps {
  label: string
  value: string
  onChange?: (value: string) => void
  icon?: LucideIcon
  type?: 'text' | 'email' | 'date'
  placeholder?: string
  disabled?: boolean
  required?: boolean
  hint?: string
  autoComplete?: string
  maxLength?: number
}

/** 普通文本输入框（左侧图标由 Icon 统一尺寸/描边） */
export function TextField({
  label,
  value,
  onChange,
  icon,
  type = 'text',
  placeholder,
  disabled,
  required,
  hint,
  autoComplete,
  maxLength,
}: TextFieldProps) {
  return (
    <div>
      <label className={LABEL_CLASS}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        {icon && (
          <Icon
            icon={icon}
            size="sm"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-warm-400"
          />
        )}
        <input
          type={type}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          maxLength={maxLength}
          className={cn(disabled ? INPUT_DISABLED_CLASS : INPUT_BASE_CLASS, icon ? 'pl-10 pr-4' : 'px-4')}
        />
      </div>
      {hint && <p className={HINT_CLASS}>{hint}</p>}
    </div>
  )
}

interface PasswordFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  show: boolean
  onToggle: () => void
  placeholder?: string
  required?: boolean
  hint?: string
  autoComplete?: string
}

/** 密码输入框（左 Key 图标 + 右显隐切换；右侧 pr-12 保证文字不被按钮盖住） */
export function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  placeholder,
  required,
  hint,
  autoComplete,
}: PasswordFieldProps) {
  return (
    <div>
      <label className={LABEL_CLASS}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <Icon
          icon={KeyRound}
          size="sm"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-warm-400"
        />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          className={cn(INPUT_BASE_CLASS, 'pl-10 pr-12')}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? '隐藏密码' : '显示密码'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600"
        >
          <Icon icon={show ? EyeOff : Eye} size="sm" />
        </button>
      </div>
      {hint && <p className={HINT_CLASS}>{hint}</p>}
    </div>
  )
}

interface SubmitButtonProps {
  loading: boolean
  label: string
  busyLabel?: string
  /** 主按钮右侧的附加操作（如「清除」） */
  children?: ReactNode
}

/** 主提交按钮 + 同行附加操作 */
export function SubmitButton({ loading, label, busyLabel = '保存中...', children }: SubmitButtonProps) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        <Icon icon={Save} size="sm" />
        {loading ? busyLabel : label}
      </button>
      {children}
    </div>
  )
}
