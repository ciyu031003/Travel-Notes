'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/**
 * 移动端页面转场（iOS push/pop 心智）：按导航方向播放不同入场动画，桌面端零影响。
 * - 仅 <768px 生效（matchMedia 门控），桌面 DOM 无动画类；
 * - 方向判定：路径变深 = push（右滑入）、变浅 = pop（左滑回）、两端都是 Tab 根或同深 = tab（淡入）；
 * - 转场只包内容区：fixed 的底部 Tab 栏在 LayoutContent 中已移出本容器，
 *   因此可以放心用 translate（此前只敢做 opacity 的原因已消除）；
 * - 页面内自带的 fixed FAB 会随内容一起滑动，符合 iOS 整页推入的观感；
 * - 首次挂载不播放，避免 SSR 水合闪白。
 */

/** 顶层 Tab 根路径：互相切换视为 tab（淡入），不产生推入方向 */
const TAB_ROOTS = ['/', '/travel', '/circle', '/me', '/sync', '/admin', '/timeline']

export type NavDirection = 'push' | 'pop' | 'tab'

function depthOf(pathname: string): number {
  const clean = pathname.split('?')[0].replace(/\/$/, '')
  if (!clean) return 0
  return clean.split('/').filter(Boolean).length
}

function isTabRoot(pathname: string): boolean {
  const clean = pathname.split('?')[0].replace(/\/$/, '')
  return TAB_ROOTS.includes(clean || '/')
}

export function classifyNavDirection(prev: string, next: string): NavDirection {
  const d0 = depthOf(prev)
  const d1 = depthOf(next)
  if (d1 > d0) {
    // 「/ → /travel」这类 Tab 互切虽然变深一级，但两端都是 Tab 根 → 淡入
    if (isTabRoot(prev) && isTabRoot(next)) return 'tab'
    return 'push'
  }
  if (d1 < d0) return 'pop'
  return 'tab'
}

const DIRECTION_CLASS: Record<NavDirection, string> = {
  push: 'm-page-push',
  pop: 'm-page-pop',
  tab: 'm-page-fade',
}

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
  const prevPath = useRef<string | null>(null)

  useEffect(() => {
    const prev = prevPath.current
    prevPath.current = pathname
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    if (!prev || prev === pathname) return
    if (!window.matchMedia('(max-width: 767px)').matches) return
    const el = ref.current
    if (!el) return
    const direction = classifyNavDirection(prev, pathname)
    const cls = DIRECTION_CLASS[direction]
    el.classList.remove('m-page-fade', 'm-page-push', 'm-page-pop')
    // 强制 reflow，保证连续导航时动画可重放
    void el.offsetWidth
    el.classList.add(cls)
    // 播完即移除：fill-mode: both 会把 transform 永久留在容器上，
    // 而任何非 none 的 transform 都会成为 fixed 后代（折叠栏等）的包含块
    el.addEventListener(
      'animationend',
      () => el.classList.remove(cls),
      { once: true },
    )
  }, [pathname])

  return (
    <div ref={ref} className={cn('m-page-shell flex min-h-0 flex-1 flex-col', className)}>
      {children}
    </div>
  )
}
