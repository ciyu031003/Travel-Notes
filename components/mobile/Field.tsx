'use client'

import type {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  ReactNode,
} from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './Icon'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'

/**
 * 移动端表单字段（M5 新增）
 * ---------------------------------------------------------------------------
 * 登录页此前**一个文件里并存 3 套输入框实现**（`:173` 桌面 travel + shell 体系、
 * `:393` 弹窗、`:448` 移动 --m-* 体系），圆角/内边距/聚焦样式各不相同；旅行
 * 新建页有 4 处重复手写输入框类串。本组件把字段收敛为唯一入口。
 *
 * 设计要点（参考 Uiverse「Inputs / Forms」分类里浮动标签 + 聚焦光晕的思路，
 * 但按本项目 token 重写，不引入渐变与 hover）：
 *  · label 与控件强关联（htmlFor/id），满足无障碍
 *  · 聚焦时描边转为强调色 + 3px 光晕（--m-ring），错误态转危险色
 *  · 控件最小高度 48px；前置图标给左侧留位
 *  · 全部颜色走 --m-* token，明暗双主题自动生效
 */
interface FieldShellProps {
  label?: string
  hint?: string
  /** 错误文案；传入即进入错误态（描边 + 光晕 + 文案都变危险色） */
  error?: string
  required?: boolean
  /** 前置图标（渲染在控件内左侧） */
  leadingIcon?: LucideIcon
  /** 后置插槽（如密码显隐按钮），调用方负责 44px 触达 */
  trailing?: ReactNode
  className?: string
  children: ReactNode
  controlClassName?: string
}

function FieldShell({
  label,
  hint,
  error,
  required,
  leadingIcon,
  trailing,
  className,
  controlClassName,
  children,
}: FieldShellProps) {
  const invalid = Boolean(error)
  return (
    <div className={cn('m-field', invalid && 'is-error', className)}>
      {label && (
        <label className="m-field-label">
          {label}
          {required && (
            <span className="m-field-required" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      <div
        className={cn(
          'm-field-control',
          leadingIcon && 'has-leading',
          trailing && 'has-trailing',
          controlClassName,
        )}
      >
        {leadingIcon && (
          <span className="m-field-leading">
            <Icon icon={leadingIcon} size="sm" />
          </span>
        )}
        {children}
        {trailing && <span className="m-field-trailing">{trailing}</span>}
      </div>
      {error ? (
        <p className="m-field-error" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="m-field-hint">{hint}</p>
      )}
    </div>
  )
}

type BaseFieldProps = {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  leadingIcon?: LucideIcon
  trailing?: ReactNode
}

export function Field({
  label,
  hint,
  error,
  required,
  leadingIcon,
  trailing,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & BaseFieldProps) {
  const fieldId = id || props.name
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      leadingIcon={leadingIcon}
      trailing={trailing}
      className={className}
    >
      <input
        id={fieldId}
        className="m-field-input"
        aria-invalid={error ? true : undefined}
        {...props}
      />
    </FieldShell>
  )
}

export function FieldTextarea({
  label,
  hint,
  error,
  required,
  leadingIcon,
  trailing,
  className,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & BaseFieldProps) {
  const fieldId = id || props.name
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      leadingIcon={leadingIcon}
      trailing={trailing}
      className={className}
      controlClassName="items-start"
    >
      <textarea
        id={fieldId}
        className="m-field-input m-field-textarea"
        aria-invalid={error ? true : undefined}
        {...props}
      />
    </FieldShell>
  )
}

export function FieldSelect({
  label,
  hint,
  error,
  required,
  leadingIcon,
  className,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & BaseFieldProps) {
  const fieldId = id || props.name
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      leadingIcon={leadingIcon}
      className={className}
      trailing={
        <span className="pr-3 text-[var(--m-faint)]">
          <Icon icon={ChevronDown} size="sm" />
        </span>
      }
    >
      <select
        id={fieldId}
        className="m-field-input appearance-none pr-10"
        aria-invalid={error ? true : undefined}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  )
}
