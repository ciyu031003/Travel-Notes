'use client'

import { useSyncExternalStore } from 'react'

/**
 * 桌面视口判定（≥1024px）—— 相册页的「桌面分支 / 移动分支」开关。
 *
 * 逻辑已收敛到 hooks/use-desktop-viewport.ts：票据夹（components/mobile/tickets）
 * 也要用同一个断点，移动端组件不能反向 import components/web/album，所以单一事实源
 * 放在 hooks/。这里保留原路径转出，既有 import 不用改。
 */
export { useDesktopViewport, DESKTOP_VIEWPORT_QUERY } from '@/hooks/use-desktop-viewport'

/** 系统「减少动态效果」—— 组件内需要跳过 JS 驱动的动效时用它 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore<boolean>(
    (cb) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => (typeof window === 'undefined' ? false : window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    () => false,
  )
}
