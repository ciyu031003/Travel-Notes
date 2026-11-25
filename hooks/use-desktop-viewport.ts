'use client'

import { useSyncExternalStore } from 'react'

/**
 * 桌面视口判定（≥1024px）—— 相册页 / 票据夹的「桌面分支 / 移动分支」唯一开关。
 *
 * 为什么用 useSyncExternalStore 而不是 useState + useEffect：
 *  · getServerSnapshot 返回 null，SSR/首帧走「未知」态 —— 调用方此时**必须**渲染
 *    与两个分支都无关的中性占位（骨架），不能赌某一侧：赌移动端就要靠媒体查询把
 *    它藏起来，一旦 JS 没执行/媒体查询不生效，桌面就只剩一张空白页（P0 事故）；
 *  · 客户端 hydration 后立刻同步到真实值，matchMedia 变化（拖窗口 / 旋转屏）时
 *    自动重渲染，桌面与移动分支可以来回切换。
 *
 * 放在 hooks/ 下而不是某个页面目录：相册（components/web/album）与票据夹
 * （components/mobile/tickets）都要用同一个断点，不能互相反向依赖。
 */
export const DESKTOP_VIEWPORT_QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mq = window.matchMedia(DESKTOP_VIEWPORT_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(DESKTOP_VIEWPORT_QUERY).matches
}

function getServerSnapshot(): null {
  return null
}

/**
 * true = ≥1024（桌面），false = <1024（移动），null = SSR / 水合首帧（断点未知）。
 * null 时请渲染中性骨架，不要渲染任何一侧的真实内容。
 */
export function useDesktopViewport(): boolean | null {
  return useSyncExternalStore<boolean | null>(subscribe, getSnapshot, getServerSnapshot)
}
