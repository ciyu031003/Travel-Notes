'use client'

import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode, ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** 统一后台输入框：樱粉移动端 token + 聚焦光环 */
export function AdminInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('m2-input', className)} {...props} />
}

/** 统一后台文本域 */
export function AdminTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('m2-input min-h-[96px] resize-none py-3', className)} {...props} />
}

interface AdminButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

/** 统一后台按钮：primary(樱粉) / secondary / ghost / danger */
export function AdminButton({ variant = 'primary', className, ...props }: AdminButtonProps) {
  return (
    <button
      className={cn(
        'm-btn',
        variant === 'primary' && 'm-btn-primary',
        variant === 'secondary' && 'm-btn-secondary',
        variant === 'ghost' && 'm-btn-ghost',
        variant === 'danger' && 'm-btn-danger',
        className,
      )}
      {...props}
    />
  )
}

/** 统一后台卡片 */
export function AdminCard({ title, icon: Icon, action, children, className }: {
  title?: string
  icon?: React.ComponentType<{ className?: string }>
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('m2-card p-5', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center gap-2">
          {title && (
            <h2 className="m2-section-title flex items-center gap-2">
              {Icon && <Icon className="h-4 w-4 text-[var(--m-accent-strong)]" />}
              {title}
            </h2>
          )}
          {action && <div className="ml-auto">{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
