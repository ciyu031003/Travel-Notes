'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hapticLight } from '@/lib/mobile/haptics'
import { Icon } from './Icon'

/**
 * 移动端按钮（M5 新增）
 * ---------------------------------------------------------------------------
 * 此前移动端**没有** Button 组件：`components/ui/Button.tsx` 是桌面组件
 * （semantic.* token + hover 态 + 40px 高），移动端从未 import 它，导致主 CTA
 * 被内联复制 5 处，甚至出现 `m-chip m-chip-active !h-11 !px-5 !text-sm` 这种
 * 拿 chip 加 !important 硬顶的写法。
 *
 * 本组件是该缺口的唯一入口：
 *  · 触达 ≥44px（默认）/ ≥52px（lg），小号 36px 仅供密集工具条使用
 *  · 按压 0.97 回弹 + light 触觉，焦点环可见（--m-ring）
 *  · 色板全部走 --m-* token，明暗双主题自动生效
 *  · 对比度：primary 用 --m-cta-bg（浅色下比 --m-accent 深一档），文字过 WCAG AA
 *  · href 分支保留 disabled / aria 语义（ui/Button 在此处有丢语义的缺陷）
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'm-btn-primary',
  secondary: 'm-btn-secondary',
  ghost: 'm-btn-ghost',
  danger: 'm-btn-danger',
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'm-btn-sm',
  md: '',
  lg: 'm-btn-lg',
}

export interface ButtonProps {
  children: ReactNode
  /** 视觉变体，默认 primary（全 App 只有一个强主色按钮） */
  variant?: ButtonVariant
  /** 尺寸，默认 md（44px）；lg=52px 用于页面主 CTA；sm=36px 仅工具条 */
  size?: ButtonSize
  /** 前置图标（默认）或后置图标，走 Icon 组件体系 */
  icon?: LucideIcon
  iconPosition?: 'leading' | 'trailing'
  /** 加载态：替换图标位为旋转指示器，并置 aria-busy + 禁用交互 */
  loading?: boolean
  /** 撑满容器宽度 */
  block?: boolean
  /** 胶囊外形（用于首页 Hero 的主 CTA） */
  round?: boolean
  href?: string
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'leading',
  loading = false,
  block = false,
  round = false,
  href,
  onClick,
  type = 'button',
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: ButtonProps) {
  const inert = disabled || loading

  const cls = cn(
    'm-btn',
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    block && 'm-btn-block',
    round && 'm-btn-round',
    className,
  )

  const handleClick = () => {
    if (inert) return
    void hapticLight()
    onClick?.()
  }

  const glyph = loading ? (
    <span className="m-btn-spinner" aria-hidden="true" />
  ) : icon ? (
    <Icon icon={icon} size={size === 'lg' ? 'md' : 'sm'} />
  ) : null

  const content = (
    <>
      {glyph && iconPosition === 'leading' && glyph}
      <span>{children}</span>
      {glyph && iconPosition === 'trailing' && glyph}
    </>
  )

  // 链接形态：disabled 时保留 aria-disabled + 拦截点击，而不是丢掉语义
  if (href) {
    return (
      <Link
        href={href}
        className={cls}
        aria-label={ariaLabel}
        aria-disabled={inert || undefined}
        aria-busy={loading || undefined}
        tabIndex={inert ? -1 : undefined}
        onClick={(e) => {
          if (inert) {
            e.preventDefault()
            return
          }
          handleClick()
        }}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      type={type}
      className={cls}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      disabled={inert}
      onClick={handleClick}
    >
      {content}
    </button>
  )
}

export default Button
