'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 font-medium transition-all disabled:opacity-40 disabled:pointer-events-none'

const variants: Record<Variant, string> = {
  primary:
    'bg-travel-accent text-white rounded-xl hover:bg-travel-accentStrong shadow-lg shadow-travel-accent/20',
  secondary:
    'bg-travel-sakura/60 text-travel-accentStrong rounded-xl hover:bg-travel-sakura dark:bg-white/10 dark:text-travel-accentSoft',
  ghost:
    'text-travel-ink/80 rounded-xl hover:bg-travel-sakura/40 hover:text-travel-ink dark:text-[#9BA3AE] dark:hover:bg-white/10',
  danger:
    'bg-travel-danger/10 text-travel-danger rounded-xl hover:bg-travel-danger/20',
}

const sizes: Record<Size, string> = {
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3.5 text-base',
}

interface ButtonProps {
  children: ReactNode
  variant?: Variant
  size?: Size
  className?: string
  href?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  'aria-label'?: string
}

/** 统一按钮：primary / secondary / ghost / danger，覆盖主操作与次级操作。 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  href,
  onClick,
  type = 'button',
  disabled,
  'aria-label': ariaLabel,
}: ButtonProps) {
  const cls = cn(base, variants[variant], sizes[size], className)
  if (href) {
    return (
      <Link href={href} className={cls} aria-label={ariaLabel} onClick={onClick}>
        {children}
      </Link>
    )
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls} aria-label={ariaLabel}>
      {children}
    </button>
  )
}
