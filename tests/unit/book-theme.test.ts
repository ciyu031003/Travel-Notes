import { describe, it, expect } from 'vitest'
import {
  BOOK_THEME_KEYS,
  BOOK_THEME_METAS,
  BOOK_THEME_OVERRIDES,
  BOOK_TIER_KEYS,
  BOOK_TIER_PROFILES,
  DEFAULT_BOOK_THEME,
  detectTier,
  isBookThemeKey,
  isBookTier,
  resolveTier,
  SSR_BOOK_TIER,
} from '@/components/album/book/themes/catalog'
import { composeFromSourceBook, toSpreads, type SourceBook, type SourceChapter } from '@/lib/modules/album/book/mapper'
import { paginate } from '@/lib/modules/album/book/paginate'

/**
 * 主题系统单测（Album 2.0 M3）
 *
 * 最重要的断言是**主题契约**：换主题不得改变页数与页序。
 * 这是"主题只影响视觉"这句话的可执行版本。
 *
 * 注意：本文件刻意只 import `themes/catalog`（纯 TS），不 import `registry.tsx`——
 * vitest 跑在 `environment: 'node'`，不解析 JSX。注册表（含主题组件）由构建与
 * 浏览器实测覆盖，纯数据（key/文案/覆盖表/档位）在这里锁死。
 */

function chapter(over: Partial<SourceChapter> = {}): SourceChapter {
  return {
    id: 11, index: 1, date: '2026-05-01', title: 'DAY 1', summary: null,
    itinerary: [], memories: [], photos: [], ...over,
  }
}

function photo(id: number, w = 1600, h = 1067) {
  return {
    id,
    thumbnailUrl: `/uploads/m${id}-thumbnail.jpg`,
    previewUrl: `/uploads/m${id}-preview.jpg`,
    blurUrl: `/uploads/m${id}-blur.jpg`,
    fullUrl: `/uploads/m${id}.jpg`,
    width: w, height: h,
  }
}

const book: SourceBook = {
  bookKey: 'travel:1', travelId: 1, title: '南京行', description: null, location: '南京',
  startDate: '2026-05-01', endDate: '2026-05-03',
  coverThumb: '/uploads/c-thumbnail.jpg', coverPreview: '/uploads/c-preview.jpg', coverBlur: '/uploads/c-blur.jpg',
  photoCount: 30,
  chapters: [
    chapter({ index: 1, date: '2026-05-01', photos: Array.from({ length: 8 }, (_, i) => photo(i + 1)) }),
    chapter({ index: 2, date: '2026-05-02', title: 'DAY 2', photos: Array.from({ length: 7 }, (_, i) => photo(i + 20, 2400, 1000)) }),
    chapter({ index: 3, date: '2026-05-03', title: 'DAY 3', photos: Array.from({ length: 15 }, (_, i) => photo(i + 60, 1000, 1500)) }),
  ],
}

describe('主题注册表（纯数据层）', () => {
  it('三个主题的 key 与元信息一一对应', () => {
    expect(BOOK_THEME_METAS.map((m) => m.key).sort()).toEqual([...BOOK_THEME_KEYS].sort())
  })

  it('每个主题元信息都有 label / description / swatch', () => {
    for (const meta of BOOK_THEME_METAS) {
      expect(BOOK_THEME_KEYS).toContain(meta.key)
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.description.length).toBeGreaterThan(0)
      expect(meta.swatch).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('默认主题在白名单内', () => {
    expect(BOOK_THEME_KEYS).toContain(DEFAULT_BOOK_THEME)
  })

  it('isBookThemeKey 只认白名单', () => {
    expect(isBookThemeKey('film')).toBe(true)
    expect(isBookThemeKey('Film')).toBe(false)
    expect(isBookThemeKey(null)).toBe(false)
    expect(isBookThemeKey(42)).toBe(false)
  })

  it('每个主题的页型覆盖表都是「局部覆盖」（不是又写一套渲染器）', () => {
    for (const key of BOOK_THEME_KEYS) {
      const overrides = BOOK_THEME_OVERRIDES[key]
      expect(overrides.length).toBeLessThan(11)
      // 覆盖率不能为 0（除画报=默认版式）也不能占满所有页型
      if (key !== 'editorial') expect(overrides.length).toBeGreaterThan(0)
    }
  })

  it('画报主题不覆盖任何内页（默认主题 == 现有观感的正式命名）', () => {
    expect(BOOK_THEME_OVERRIDES.editorial).toHaveLength(0)
  })

  it('覆盖表里的页型名都在 BookPageType 白名单内', () => {
    const VALID = new Set([
      'COVER', 'OPENING', 'DAY_OPENING', 'FULL_BLEED', 'PHOTO_CAPTION',
      'PHOTO_PAIR', 'COLLAGE', 'TIMELINE', 'TEXT', 'INDEX', 'ENDING',
    ])
    for (const key of BOOK_THEME_KEYS) {
      for (const type of BOOK_THEME_OVERRIDES[key]) expect(VALID.has(type)).toBe(true)
    }
  })
})

describe('主题契约：主题不得改变分页结果', () => {
  const composed = composeFromSourceBook(book)

  it('编排是确定性的（主题根本不在编排输入里）', () => {
    // composeFromSourceBook 的签名里没有主题参数——这条断言把"将来有人往
    // composer 里传主题"这种退化挡住。
    expect(JSON.stringify(composeFromSourceBook(book).pages)).toBe(JSON.stringify(composed.pages))
  })

  it('single / dual 对开数量与页码可重复得出同一结果', () => {
    const single = paginate(composed.pages, 'single')
    const dual = paginate(composed.pages, 'dual')
    // 页序与页码只由 pages + mode 决定；重复调用必须逐字段相等
    expect(paginate(composed.pages, 'single')).toEqual(single)
    expect(paginate(composed.pages, 'dual')).toEqual(dual)
    expect(single.map((s) => s.pageNumber)).toEqual(single.map((_, i) => i + 1))
    expect(dual.map((s) => s.pageNumber)).toEqual(dual.map((_, i) => i + 1))
  })

  it('主题注册表（纯数据）不携带任何组件，因此不可能影响分页', () => {
    for (const key of BOOK_THEME_KEYS) {
      const overrides = BOOK_THEME_OVERRIDES[key]
      expect(overrides.every((v) => typeof v === 'string')).toBe(true)
    }
  })
})

describe('视觉档', () => {
  it('三个档位都有完整 profile', () => {
    for (const tier of BOOK_TIER_KEYS) {
      const p = BOOK_TIER_PROFILES[tier]
      expect(p.flippingTime).toBeGreaterThanOrEqual(0)
      expect(typeof p.drawShadow).toBe('boolean')
      expect(typeof p.useBlurPlaceholder).toBe('boolean')
    }
  })

  it('reduced 档为直切（0ms）且不画阴影', () => {
    expect(BOOK_TIER_PROFILES.reduced.flippingTime).toBe(0)
    expect(BOOK_TIER_PROFILES.reduced.drawShadow).toBe(false)
  })

  it('standard 比 lite 慢且画阴影', () => {
    expect(BOOK_TIER_PROFILES.standard.flippingTime).toBeGreaterThan(BOOK_TIER_PROFILES.lite.flippingTime)
    expect(BOOK_TIER_PROFILES.standard.drawShadow).toBe(true)
    expect(BOOK_TIER_PROFILES.lite.drawShadow).toBe(false)
  })

  it('isBookTier 只认白名单', () => {
    expect(isBookTier('lite')).toBe(true)
    expect(isBookTier('LITE')).toBe(false)
    expect(isBookTier(null)).toBe(false)
  })

  it('resolveTier：prefers-reduced-motion 强制 reduced，用户偏好无法绕过', () => {
    expect(resolveTier('standard', true)).toBe('reduced')
    expect(resolveTier('lite', true)).toBe('reduced')
    expect(resolveTier('lite', false)).toBe('lite')
    expect(resolveTier(null, false)).toBe(SSR_BOOK_TIER)
    expect(resolveTier('garbage' as unknown as null, false)).toBe(SSR_BOOK_TIER)
  })

  it('detectTier 在无 window 环境返回 SSR 安全档', () => {
    expect(detectTier()).toBe(SSR_BOOK_TIER)
  })
})
