'use client'

import { BOOK_THEME_KEYS, DEFAULT_BOOK_THEME, isBookThemeKey, type BookTheme } from './types'
import { EDITORIAL_THEME } from './editorial'
import { FILM_THEME } from './film'
import { MEMORY_THEME } from './memory'

/**
 * 主题注册表（Album 2.0 M3）
 *
 * 刻意**静态注册、不走 React.lazy 分包**：
 * 本项目的测试门禁是 `environment: 'node'`，`React.lazy` + Suspense 会让 page-flip
 * 在异步解析主题组件期间拿到未渲染完成的页元素（页集合是一次性交付的），
 * 为了几 KB 的 CSS 去冒"翻页首帧空白/页高错位"的风险不划算。
 * 主题差异主要在 CSS（按 data-book-theme 作用域），JS 侧只覆盖少数页型。
 */
const REGISTRY: Record<string, BookTheme> = {
  [EDITORIAL_THEME.key]: EDITORIAL_THEME,
  [FILM_THEME.key]: FILM_THEME,
  [MEMORY_THEME.key]: MEMORY_THEME,
}

/** 取主题；未知 key 回落默认主题（绝不抛错——画册读不出来比配色不对严重得多） */
export function getBookTheme(key: string | null | undefined): BookTheme {
  if (isBookThemeKey(key)) return REGISTRY[key] ?? EDITORIAL_THEME
  return REGISTRY[DEFAULT_BOOK_THEME]
}

/** 已注册的主题 key（诊断/测试用） */
export function registeredThemeKeys(): string[] {
  return Object.keys(REGISTRY)
}

export { BOOK_THEME_KEYS }
