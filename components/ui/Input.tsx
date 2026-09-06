'use client'

import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

const inputBase =
  'w-full rounded-xl border border-semantic-line bg-semantic-surface px-4 py-2.5 text-sm text-semantic-text placeholder-semantic-faint shadow-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-semantic-accentSoft/50'

interface InputFieldProps {
  label?: string
  hint?: string
  required?: boolean
}

/** 统一输入框（支持 label / hint / required，满足无障碍：label 与控件关联） */
export function Input({
  label,
  hint,
  required,
  id,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & InputFieldProps) {
  const inputId = id || props.name
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-semantic-text">
          {label}
          {required && <span className="ml-0.5 text-travel-danger">*</span>}
        </label>
      )}
      <input id={inputId} className={cn(inputBase)} {...props} />
      {hint && <p className="mt-1 text-xs text-semantic-faint">{hint}</p>}
    </div>
  )
}

/** 统一文本域 */
export function Textarea({
  label,
  hint,
  required,
  id,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & InputFieldProps) {
  const inputId = id || props.name
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-semantic-text">
          {label}
          {required && <span className="ml-0.5 text-travel-danger">*</span>}
        </label>
      )}
      <textarea id={inputId} className={cn(inputBase, 'resize-none py-3')} {...props} />
      {hint && <p className="mt-1 text-xs text-semantic-faint">{hint}</p>}
    </div>
  )
}
