'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BOOK_TIER_PROFILES,
  DEFAULT_BOOK_THEME,
  detectTier,
  isBookThemeKey,
  isBookTier,
  resolveTier,
  SSR_BOOK_TIER,
  type BookTheme,
  type BookTier,
  type BookTierProfile,
} from './types'
import { getBookTheme } from './registry'

/**
 * 画册主题 / 视觉档运行时（Album 2.0 M3）
 *
 * 两个关注点刻意分开，因为它们**正交**：
 *   · 主题（画报/胶片/手记）= 用户审美选择，持久化到 localStorage；
 *   · 视觉档（standard/lite/reduced）= 设备能力 + 无障碍偏好，reduced 由
 *     `prefers-reduced-motion` **强制**，用户不能绕过（无障碍优先）。
 *
 * 为什么用 Hook 而不是 Context Provider：`BookPageBody` 在 page-flip 的页元素内部，
 * page-flip 会自己搬动这些 DOM；props 传不进去，而画册阅读器只有一个实例，
 * 用模块级 Hook + 显式传 `themeKey` 足够，也少一层 Provider。
 */

const THEME_KEY = 'album-book-theme'
const TIER_KEY = 'album-book-tier'

/** 主题 token → 内联 CSS 变量（保持"主题不写死进全局样式表"这条约定） */
export function themeStyle(theme: BookTheme): Record<string, string> {
  return { ...theme.tokens }
}

/**
 * 主题选择 Hook。
 * SSR / 首帧必须用默认主题（服务端读不到 localStorage），挂载后再恢复用户偏好，
 * 否则会有 hydration mismatch（与 `app/album/page.tsx` 的 viewMode 同一处理方式）。
 */
export function useBookTheme(): {
  themeKey: string
  theme: BookTheme
  setThemeKey: (key: string) => void
} {
  const [themeKey, setKey] = useState<string>(DEFAULT_BOOK_THEME)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY)
      if (isBookThemeKey(saved)) setKey(saved)
    } catch {
      // 忽略
    }
  }, [])

  const setThemeKey = useCallback((key: string) => {
    if (!isBookThemeKey(key)) return
    setKey(key)
    try {
      localStorage.setItem(THEME_KEY, key)
    } catch {
      // 忽略
    }
  }, [])

  const theme = useMemo(() => getBookTheme(themeKey), [themeKey])
  return { themeKey, theme, setThemeKey }
}

/** 把主题 token 注入为 CSS 变量（挂在画册根节点上） */
export function BookThemeRoot({
  theme,
  children,
  className,
}: {
  theme: BookTheme
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className} style={themeStyle(theme)} data-book-theme={theme.key}>
      {children}
    </div>
  )
}

/**
 * 视觉档 Hook。
 * `prefers-reduced-motion: reduce` 时强制 reduced（用户显式选择只在未开启该偏好时生效）。
 */
export function useBookTier(): {
  tier: BookTier
  profile: BookTierProfile
  motionReduced: boolean
} {
  const [preference, setPreference] = useState<BookTier | null>(null)
  const [motionReduced, setMotionReduced] = useState(false)

  useEffect(() => {
    let mq: MediaQueryList | null = null
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      setMotionReduced(mq.matches)
    } catch {
      // 忽略
    }
    let saved: string | null = null
    try {
      saved = localStorage.getItem(TIER_KEY)
    } catch {
      // 忽略
    }
    setPreference(isBookTier(saved) ? saved : detectTier())

    const onChange = (e: MediaQueryListEvent) => setMotionReduced(e.matches)
    mq?.addEventListener?.('change', onChange)
    return () => mq?.removeEventListener?.('change', onChange)
  }, [])

  const tier = resolveTier(preference, motionReduced)
  return { tier, profile: BOOK_TIER_PROFILES[tier], motionReduced }
}

export { SSR_BOOK_TIER }
