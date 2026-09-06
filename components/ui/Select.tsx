'use client'

import type { SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SelectFieldProps {
  label?: string
  hint?: string
  required?: boolean
}

/** 统一下拉选择（label / hint / required，样式与 ui/Input 对齐） */
export function Select({
  label,
  hint,
  required,
  id,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & SelectFieldProps) {
  const selectId = id || props.name
  return (
    <div className={className}>
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-semantic-text">
          {label}
          {required && <span className="ml-0.5 text-travel-danger">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            'w-full appearance-none rounded-xl border border-semantic-line bg-semantic-surface px-4 py-2.5 pr-9 text-sm text-semantic-text shadow-sm transition-all',
            'focus:border-transparent focus:outline-none focus:ring-2 focus:ring-semantic-accentSoft/50',
            '[&>option]:bg-semantic-surface'
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-semantic-faint" />
      </div>
      {hint && <p className="mt-1 text-xs text-semantic-faint">{hint}</p>}
    </div>
  )
}
