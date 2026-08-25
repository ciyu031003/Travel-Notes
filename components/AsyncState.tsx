'use client'

import { Loader2, MapPin, Compass, AlertCircle, RefreshCw } from 'lucide-react'

type AsyncStateProps = {
  /** 状态类型 */
  variant: 'loading' | 'error' | 'empty'
  /** 主标题文案（状态名已由组件提供时可不传） */
  title?: string
  /** 副文案，如「还没有旅行记录」「网络错误，请稍后重试」 */
  message?: string
  /** 空/错误态的可选操作按钮（如「去旅行地图看看」「重试」） */
  actionLabel?: string
  onAction?: () => void
  /** 额外的说明子文案 */
  hint?: string
  /** 垂直布局的最小高度，默认 60vh */
  minHeight?: string
}

/**
 * 前台页面的统一异步状态组件：
 * - loading：转圈 + 文案
 * - error：警示图标 + 文案 + 可选「重试」
 * - empty：叙事性空状态（遵循设计规范「公开旅行为空时使用叙事性 Empty State」）
 * 全部使用 travel.* 暖色 token，替换各页面重复的 text-gray-500 占位。
 */
export default function AsyncState({
  variant,
  title,
  message,
  actionLabel,
  onAction,
  hint,
  minHeight = '60vh',
}: AsyncStateProps) {
  if (variant === 'loading') {
    return (
      <div
        className="container-custom flex flex-col items-center justify-center gap-4"
        style={{ minHeight }}
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-9 w-9 animate-spin text-travel-accent dark:text-travel-bloom" />
        <p className="text-sm text-travel-ink dark:text-shell-muted">{message || '正在加载…'}</p>
      </div>
    )
  }

  if (variant === 'error') {
    return (
      <div
        className="container-custom flex flex-col items-center justify-center gap-4 text-center"
        style={{ minHeight }}
        role="alert"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-travel-line/70 bg-travel-sakura/20 dark:border-shell-line dark:bg-white/5">
          <AlertCircle className="h-8 w-8 text-travel-accent dark:text-travel-bloom" />
        </span>
        <div className="space-y-1.5">
          <p className="text-base font-semibold text-travel-ink dark:text-[#F1EFEA]">
            {title || '加载失败'}
          </p>
          {message && (
            <p className="text-sm text-travel-ink/70 dark:text-shell-muted">{message}</p>
          )}
          {hint && (
            <p className="text-xs text-travel-sand dark:text-shell-faint">{hint}</p>
          )}
        </div>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-2 rounded-xl bg-travel-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-travel-accentStrong"
          >
            <RefreshCw className="h-4 w-4" />
            {actionLabel}
          </button>
        )}
      </div>
    )
  }

  // empty
  return (
    <div
      className="container-custom flex flex-col items-center justify-center gap-4 text-center"
      style={{ minHeight }}
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-travel-accentSoft/70 dark:border-travel-bloom/40 bg-travel-sakura/20 dark:bg-[#241B15]">
        <Compass className="h-8 w-8 text-travel-accent dark:text-travel-bloom" />
      </span>
      <div className="space-y-1.5">
        <p className="text-base font-semibold text-travel-ink dark:text-[#F1EFEA]">
          {title || '这里还空着'}
        </p>
        {message && (
          <p className="text-sm text-travel-ink/70 dark:text-shell-muted">{message}</p>
        )}
        {hint && (
          <p className="text-xs text-travel-sand dark:text-shell-faint">{hint}</p>
        )}
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2 rounded-xl bg-travel-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-travel-accentStrong"
        >
          <MapPin className="h-4 w-4" />
          {actionLabel}
        </button>
      )}
    </div>
  )
}
