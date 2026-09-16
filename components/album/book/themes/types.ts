import type { ComponentType } from 'react'
import type { BookPage, BookPageType } from '@/lib/modules/album/book/types'
import type { BookThemeKey } from './catalog'

/**
 * 画册主题系统的**类型层**（纯 TS，无 JSX）。
 * 运行时数据在 `catalog.ts`，组件实现在 `registry.tsx`。
 */

export type { BookThemeKey }
export {
  BOOK_THEME_KEYS,
  BOOK_THEME_METAS,
  BOOK_THEME_OVERRIDES,
  DEFAULT_BOOK_THEME,
  isBookThemeKey,
  BOOK_TIER_KEYS,
  BOOK_TIER_PROFILES,
  isBookTier,
  detectTier,
  resolveTier,
  SSR_BOOK_TIER,
  SSR_BOOK_TIER_PROFILE,
} from './catalog'
export type { BookThemeMeta, BookTier, BookTierProfile } from './catalog'

export interface PageBodyProps {
  page: BookPage
}

/** 主题只覆盖「需要不同视觉」的页型，其余回落默认画报版式 */
export type ThemeBodies = Partial<Record<BookPageType, ComponentType<PageBodyProps>>>

export interface BookTheme {
  key: BookThemeKey
  /** UI 展示名 */
  label: string
  /** 一句话定位（切换控件的 title） */
  description: string
  /** 注入到画册根的 CSS 自定义属性 */
  tokens: Record<string, string>
  /** 按页型替换的视觉组件 */
  bodies: ThemeBodies
  /** 封面组件（封面材质与内页完全不同，单独给） */
  cover: ComponentType<PageBodyProps>
}
