'use client'

import { useSyncExternalStore } from 'react'

/**
 * 桌面视口判定（≥1024px）—— 相册页的「桌面分支 / 移动分支」唯一开关。
 *
 * 为什么用 useSyncExternalStore 而不是 useState + useEffect：
 *  · getServerSnapshot 返回 null，SSR/首帧走「未知」态（渲染原有移动端分支，保证
 *    <1024 的视觉与行为一个像素都不变），客户端 hydration 后立刻同步到真实值；
 *  · matchMedia 变化（拖窗口 / 旋转屏）时自动重渲染，桌面与移动分支可以来回切换。
 */
const QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(QUERY).matches
}

function getServerSnapshot(): boolean | null {
  return null
}

export function useDesktopViewport(): boolean | null {
  return useSyncExternalStore<boolean | null>(subscribe, getSnapshot, getServerSnapshot)
}

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
