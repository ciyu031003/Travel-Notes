'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Icon } from '@/components/mobile/Icon'
import { AlertCircle, NAV_ICON, RefreshCw } from '@/lib/mobile/icon-system'
import { MobilePageShell } from '@/components/mobile/MobilePageShell'

/**
 * 旅行圈路由级兜底：列表卡片或页面局部状态异常时不再落到全站错误页。
 * URL 保持不变，用户可以直接重试或返回旅行圈首页。
 */
export default function CircleError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app/circle/error] 旅行圈渲染失败:', error)
  }, [error])

  return (
    <MobilePageShell
      className="bg-[var(--ui-social-bg)] text-[var(--ui-social-text)]"
      contentClassName="flex min-h-[calc(100dvh-var(--m-safe-top))] flex-col items-center justify-center gap-4 px-6 pb-[calc(96px+env(safe-area-inset-bottom))] text-center md:pb-8"
      bottomNavSafe={false}
    >
      <Icon icon={AlertCircle} size="lg" tone="faint" />
      <h1 className="text-base font-semibold">旅行圈暂时没能打开</h1>
      <p className="max-w-xs text-sm leading-6 text-[var(--ui-social-muted)]">
        这次是页面渲染出了问题，链接仍然保留。可以重试一次，或先回旅行圈首页。
      </p>
      {error.digest && (
        <p className="text-xs text-[var(--ui-social-faint)]">错误编号：{error.digest}</p>
      )}
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ui-social-accent)] px-5 py-2.5 text-sm font-medium text-[var(--ui-social-on-accent)]"
        >
          <Icon icon={RefreshCw} size="sm" />
          重试
        </button>
        <Link
          href="/circle"
          className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm text-[var(--ui-social-muted)] ring-1 ring-[var(--ui-social-line)]"
        >
          <Icon icon={NAV_ICON.circle} size="sm" />
          返回旅行圈
        </Link>
      </div>
    </MobilePageShell>
  )
}
