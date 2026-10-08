'use client'

import { useSyncExternalStore } from 'react'

const MOBILE_MEDIA_QUERY = '(max-width: 767px)'

function subscribe(onStoreChange: () => void): () => void {
  const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY)
  mediaQuery.addEventListener('change', onStoreChange)
  return () => mediaQuery.removeEventListener('change', onStoreChange)
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

/**
 * SSR 阶段返回 null，让页面先渲染中性占位；客户端 hydration 后再锁定当前断点。
 * 这样服务端不会提前挂载桌面树，移动端也不会短暂执行桌面专用副作用。
 */
function getServerSnapshot(): null {
  return null
}

export function useIsMobile(): boolean | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
