import Link from 'next/link'
import { NAV_ICON } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'

/**
 * 品牌化 404（P1-20 / U-1）：不存在的详情页不再落到 Next 默认黑白页。
 * 纯服务端组件（无客户端状态），不依赖任何浏览器 API。
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-3xl border border-travel-line/70 bg-semantic-surface p-8 text-center shadow-xs dark:border-shell-line dark:bg-shell-surface">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-travel-sakura/50 text-travel-accent dark:bg-travel-accent/15 dark:text-travel-bloom">
          <Icon icon={NAV_ICON.circle} size="lg" />
        </span>
        <p className="mt-5 text-xs font-medium uppercase tracking-[0.28em] text-travel-accent dark:text-travel-bloom">
          404
        </p>
        <h1 className="mt-2 text-lg font-semibold text-travel-inkStrong dark:text-shell-text">这段旅程不存在</h1>
        <p className="mt-2 text-sm leading-relaxed text-travel-ink/80 dark:text-shell-muted">
          链接可能已失效，或者内容已被作者删除。回到首页继续看看别的旅行吧。
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-travel-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-travel-accentStrong"
        >
          <Icon icon={NAV_ICON.home} size="sm" />
          回首页
        </Link>
      </div>
    </div>
  )
}
