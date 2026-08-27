'use client'

import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode, ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** 统一后台输入框：暖陶土 token + 聚焦 travel-accent 环 */
export function AdminInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-travel-line/60 bg-white/80 px-4 py-2.5 text-sm text-travel-ink placeholder-travel-sand/50 shadow-sm transition-all dark:border-shell-line dark:bg-white/5 dark:text-shell-text',
        'focus:border-transparent focus:outline-none focus:ring-2 focus:ring-travel-accentSoft/50',
        className
      )}
      {...props}
    />
  )
}

/** 统一后台文本域 */
export function AdminTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full resize-none rounded-xl border border-travel-line/60 bg-white/80 px-4 py-3 text-sm text-travel-ink placeholder-travel-sand/50 shadow-sm transition-all dark:border-shell-line dark:bg-white/5 dark:text-shell-text',
        'focus:border-transparent focus:outline-none focus:ring-2 focus:ring-travel-accentSoft/50',
        className
      )}
      {...props}
    />
  )
}

interface AdminButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

/** 统一后台按钮：primary(陶土) / secondary(纸面) / ghost / danger */
export function AdminButton({ variant = 'primary', className, ...props }: AdminButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
        variant === 'primary' && 'bg-travel-accent text-white shadow-lg shadow-travel-accent/20 hover:bg-travel-accentStrong',
        variant === 'secondary' && 'border border-travel-line/60 bg-white/80 text-travel-ink hover:bg-travel-sakura/40 dark:border-shell-line dark:bg-white/5 dark:text-shell-text',
        variant === 'ghost' && 'text-travel-ink/70 hover:bg-travel-sakura/40 hover:text-travel-ink dark:text-shell-muted dark:hover:bg-white/5',
        variant === 'danger' && 'bg-travel-danger/10 text-travel-danger hover:bg-travel-danger/20',
        className
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
    <div className={cn('rounded-2xl border border-travel-line/50 bg-white/80 p-6 shadow-soft dark:border-shell-line dark:bg-shell-bg/80', className)}>
      {title && (
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-travel-inkStrong dark:text-shell-text">
          {Icon && <Icon className="h-4 w-4 text-travel-accentSoft" />}
          {title}
        </h2>
      )}
      {children}
    </div>
  )
}
