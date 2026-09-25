'use client'

import { cn } from '@/lib/utils'

/**
 * 加载指示器（M5 新增）
 * ---------------------------------------------------------------------------
 * 参考 Uiverse「loaders」分类里三种克制的结构（点脉冲 / 轨道环 / 波纹），
 * 但按本项目 token 重写：颜色只取 currentColor 或 --m-accent，不含渐变与发光。
 *
 * 规范 §7 明令「除 loading 外禁止无限循环动画」—— 本组件是**唯一**允许
 * 无限动画的场景，且三个变体都已在 mobile.css 的 prefers-reduced-motion
 * 列表内，降级时完全静止。
 */
export type LoaderVariant = 'dots' | 'ring' | 'ripple'
export type LoaderSize = 'sm' | 'md' | 'lg'

const RING_SIZE: Record<LoaderSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
}

const RIPPLE_SIZE: Record<LoaderSize, string> = {
  sm: 'h-5 w-5',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
}

const DOT_SIZE: Record<LoaderSize, string> = {
  sm: 'h-1 w-1',
  md: 'h-1.5 w-1.5',
  lg: 'h-2 w-2',
}

export function Loader({
  variant = 'dots',
  size = 'md',
  /** 无障碍文案；给空字符串则视为纯装饰（aria-hidden） */
  label = '加载中',
  className,
}: {
  variant?: LoaderVariant
  size?: LoaderSize
  label?: string
  className?: string
}) {
  const decorative = label === ''
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'status' as const, 'aria-label': label }

  if (variant === 'ring') {
    return (
      <span className={cn('m-loader', RING_SIZE[size], className)} {...a11y}>
        <span className="m-loader-ring" />
      </span>
    )
  }

  if (variant === 'ripple') {
    return (
      <span className={cn('m-loader', RIPPLE_SIZE[size], className)} {...a11y}>
        <span className="m-loader-ripple block h-full w-full" />
      </span>
    )
  }

  return (
    <span className={cn('m-loader m-loader-dots', className)} {...a11y}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={cn('m-loader-dot', DOT_SIZE[size])} />
      ))}
    </span>
  )
}

/**
 * 整页/整块加载态：居中 + 可选文案。
 * 用于替换各处手写的 `<p>加载中...</p>`（登录页 :485 曾用裸 hex 背景 + 该文案）。
 */
export function LoaderBlock({
  variant = 'dots',
  label = '加载中',
  className,
}: {
  variant?: LoaderVariant
  label?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-h-[160px] flex-col items-center justify-center gap-3',
        className,
      )}
    >
      <Loader variant={variant} size="lg" label="" />
      <p className="m-caption text-[var(--m-muted)]">{label}</p>
    </div>
  )
}

export default Loader
