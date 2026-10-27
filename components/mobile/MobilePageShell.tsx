import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * 移动端页面基础壳。
 *
 * 系统状态栏 inset 与页面内容间距分开处理：这里只消费统一的 m-safe-top，
 * 页面不再各自决定 16/26/40 等顶部值。桌面端不使用该组件。
 */
export function MobilePageShell({
  children,
  className,
  contentClassName,
  bottomNavSafe = true,
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
  bottomNavSafe?: boolean
}) {
  return (
    <div
      className={cn(
        'm-mobile-page',
        bottomNavSafe && 'm-bottom-nav-safe',
        className,
      )}
    >
      <div className={cn('m-safe-top min-w-0', contentClassName)}>
        {children}
      </div>
    </div>
  )
}
