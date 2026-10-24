'use client'

import type { ReactNode } from 'react'
import { useIsMobile } from '@/hooks/use-is-mobile'

/**
 * 声明式断点包装（P-13 跨端收敛）。
 *
 * 为什么需要：useIsMobile 的三态（null 水合前）让每个页面都写
 * `isMobile === true ? ... : ...` 分支，样板在 8 个页面重复。
 * 这两个包装把"按断点渲染一支"收敛成组件语义 —— null 时两个都渲染 null，
 * 由调用方在包装之外自行处理中性骨架（保证 SSR/首帧不偏向任何一棵树）。
 *
 * 注意：**不要**用它们做 CSS 隐藏的替代品去同时挂两棵重树——
 * 它们的意义恰恰是"只挂载一支"（桌面树的重依赖不会在手机上执行）。
 */
export function MobileOnly({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile()
  if (isMobile !== true) return null
  return <>{children}</>
}

export function DesktopOnly({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile()
  if (isMobile !== false) return null
  return <>{children}</>
}
