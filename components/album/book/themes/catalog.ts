/**
 * 画册主题「目录」—— 纯数据，**不含任何 React 组件**。
 *
 * 刻意与 `registry.tsx`（含主题组件实现）分开：
 * 本项目的单测跑在 `environment: 'node'`，只解析 `.ts`；把 key / 文案 / 视觉档这类
 * 纯数据放在这里，就能在不引入 JSX 的前提下断言「主题契约」与档位行为。
 * 组件实现留在 registry（浏览器侧）。
 */

export type BookThemeKey = 'editorial' | 'film' | 'memory'

export const BOOK_THEME_KEYS: readonly BookThemeKey[] = ['editorial', 'film', 'memory']
export const DEFAULT_BOOK_THEME: BookThemeKey = 'editorial'

export function isBookThemeKey(v: unknown): v is BookThemeKey {
  return typeof v === 'string' && (BOOK_THEME_KEYS as readonly string[]).includes(v)
}

/** 主题元信息（切换控件渲染用，避免各处手写文案） */
export interface BookThemeMeta {
  key: BookThemeKey
  label: string
  description: string
  /** 主题主色（用于切换控件的色点；与 tokens['--book-accent'] 同源） */
  swatch: string
}

export const BOOK_THEME_METAS: readonly BookThemeMeta[] = [
  { key: 'editorial', label: '画报', description: '现代旅行摄影画册 · 米白纸张 · 大留白', swatch: '#f7f6f0' },
  { key: 'film', label: '胶片', description: '胶片负片 · 齿孔边框 · 日期戳 · 接触印相', swatch: '#16130f' },
  { key: 'memory', label: '手记', description: '旅行手记 · 票据便签 · 克制的书写感', swatch: '#f6f1e4' },
]

/** 主题 key → 该主题覆盖的页型（供测试断言"只做局部覆盖"） */
export const BOOK_THEME_OVERRIDES: Record<BookThemeKey, readonly string[]> = {
  // 画报 = 现有观感的正式命名，不覆盖任何内页
  editorial: [],
  film: ['DAY_OPENING', 'FULL_BLEED', 'PHOTO_CAPTION', 'PHOTO_PAIR', 'COLLAGE', 'INDEX'],
  memory: ['DAY_OPENING', 'FULL_BLEED', 'PHOTO_CAPTION', 'PHOTO_PAIR', 'COLLAGE', 'INDEX', 'ENDING'],
}

/* ------------------------------------------------------------------ */
/* 视觉档（与主题正交）：设备能力 / 用户偏好决定动效与阴影强度            */
/* ------------------------------------------------------------------ */

export type BookTier = 'standard' | 'lite' | 'reduced'

export const BOOK_TIER_KEYS: readonly BookTier[] = ['standard', 'lite', 'reduced']

export function isBookTier(v: unknown): v is BookTier {
  return typeof v === 'string' && (BOOK_TIER_KEYS as readonly string[]).includes(v)
}

export interface BookTierProfile {
  /** 翻页动画时长（ms）；reduced 档为 0（直切） */
  flippingTime: number
  /** 是否绘制翻页阴影（lite 关闭以省 GPU） */
  drawShadow: boolean
  /** 图片占位是否使用 BLUR 变体（lite 用纯色底省一次小请求） */
  useBlurPlaceholder: boolean
}

export const BOOK_TIER_PROFILES: Record<BookTier, BookTierProfile> = {
  // 原实现为 760ms；M2 起收敛到 560ms（更快的手感，仍在"翻页可读"区间）
  standard: { flippingTime: 560, drawShadow: true, useBlurPlaceholder: true },
  lite: { flippingTime: 380, drawShadow: false, useBlurPlaceholder: false },
  // 直切：不做翻页动画（prefers-reduced-motion 的强制结果）
  reduced: { flippingTime: 0, drawShadow: false, useBlurPlaceholder: true },
}

/** SSR/首帧用的安全档（与服务端一致，避免 hydration mismatch） */
export const SSR_BOOK_TIER: BookTier = 'standard'
export const SSR_BOOK_TIER_PROFILE: BookTierProfile = BOOK_TIER_PROFILES[SSR_BOOK_TIER]

/** 依据设备能力猜一个初始档（宁保守：低端机默认 lite） */
export function detectTier(): BookTier {
  if (typeof window === 'undefined') return SSR_BOOK_TIER
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'reduced'
  } catch {
    // 忽略
  }
  const nav = window.navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number }
  const cores = nav.hardwareConcurrency ?? 4
  const memory = nav.deviceMemory
  if (cores <= 4 || (typeof memory === 'number' && memory <= 4)) return 'lite'
  return 'standard'
}

/** 用户偏好 + 无障碍偏好 → 最终档位（reduced 由 prefers-reduced-motion 强制） */
export function resolveTier(preference: BookTier | null | undefined, motionReduced: boolean): BookTier {
  if (motionReduced) return 'reduced'
  return isBookTier(preference) ? preference : SSR_BOOK_TIER
}
