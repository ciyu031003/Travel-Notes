'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/**
 * 移动端页面转场（iOS 心智）：路由变更时内容淡入，桌面端零影响。
 * - 仅 <768px 生效（matchMedia 门控），桌面 DOM 无动画类；
 * - 只做 opacity，不做 translate：页面内含 position:fixed 的 FAB 等元素，
 *   transform 会让 fixed 锚点错乱产生跳动；
 * - 顶层 wrapper 保持 flex flex-col flex-1，不破坏桌面 flex 壳层；
 * - 首次挂载不播放，避免 SSR 水合闪白。
 */
export function MobilePageTransition({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)
  const firstRun = useRef(true)

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    if (!window.matchMedia('(max-width: 767px)').matches) return
    const el = ref.current
    if (!el) return
    el.classList.remove('m-page-fade')
    // 强制 reflow，保证连续导航时动画可重放
    void el.offsetWidth
    el.classList.add('m-page-fade')
  }, [pathname])

  return (
    <div ref={ref} className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {children}
    </div>
  )
}
