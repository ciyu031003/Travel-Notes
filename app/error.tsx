'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { AlertCircle, RefreshCw, NAV_ICON } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'

/**
 * 路由级错误兜底（P1-20 / U-1）：任何页面渲染抛错时替换整页，而不是英文白屏。
 * 用现有 travel.* / semantic.* token，与站点视觉一致；「重试」调用 reset 重新渲染
 * 该段路由（App Router 会重新执行页面组件），「回首页」给一条明确的退路。
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 必须留日志：生产环境用户只看到兜底页，原因只能从这里查（含 digest 便于对服务端日志）
    console.error('[app/error] 页面渲染失败:', error)
  }, [error])

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-3xl border border-travel-line/70 bg-semantic-surface p-8 text-center shadow-xs dark:border-shell-line dark:bg-shell-surface">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-travel-sakura/50 text-travel-accent dark:bg-travel-accent/15 dark:text-travel-bloom">
          <Icon icon={AlertCircle} size="lg" />
        </span>
        <h1 className="mt-5 text-lg font-semibold text-travel-inkStrong dark:text-shell-text">页面出了点问题</h1>
        <p className="mt-2 text-sm leading-relaxed text-travel-ink/80 dark:text-shell-muted">
          刚才的操作没有完成，你可以重试一次；如果反复出现，请回到首页再进入。
        </p>
        {error?.digest && (
          <p className="mt-2 text-xs text-travel-ink/50 dark:text-shell-faint">错误编号：{error.digest}</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-full bg-travel-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-travel-accentStrong"
          >
            <Icon icon={RefreshCw} size="sm" />
            重试
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-travel-line px-5 py-2.5 text-sm font-medium text-travel-ink transition hover:bg-travel-sakura/30 dark:border-shell-line dark:text-shell-text dark:hover:bg-white/5"
          >
            <Icon icon={NAV_ICON.home} size="sm" />
            回首页
          </Link>
        </div>
      </div>
    </div>
  )
}
