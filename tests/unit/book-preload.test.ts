import { describe, it, expect, afterEach } from 'vitest'
import {
  collectPreloadUrls,
  preloadAdjacentSpreads,
  resetPreloadCache,
  spreadUrls,
} from '@/lib/modules/album/book/preload'
import type { BookPage, BookPhotoRef, BookSpread } from '@/lib/modules/album/book/types'

/**
 * 邻页预热单测（Album 2.0 M2）
 * 守住的核心契约：**只预热当前跨页 ±1，不拉全书**。
 * 上游 react-pageflip issue #14 的教训就是"初始化时请求所有图片"。
 */

function photo(id: number, over: Partial<BookPhotoRef> = {}): BookPhotoRef {
  return {
    mediaId: id,
    fullUrl: `/uploads/m${id}.jpg`,
    thumbnailUrl: `/uploads/m${id}-thumbnail.jpg`,
    previewUrl: `/uploads/m${id}-preview.jpg`,
    blurUrl: `/uploads/m${id}-blur.jpg`,
    aspect: 1.5,
    takenAt: null,
    locationName: null,
    ...over,
  }
}

function page(id: string, photos: BookPhotoRef[]): BookPage {
  return { id, type: 'PHOTO_CAPTION', dayIndex: 1, photos }
}

function spread(n: number, photos: BookPhotoRef[]): BookSpread {
  return { id: `spread-${n}`, left: null, right: page(`p${n}`, photos), pageNumber: n + 1 }
}

/** 5 个跨页，每页 1 张图 → m1..m5 */
const spreads: BookSpread[] = [1, 2, 3, 4, 5].map((n) => spread(n - 1, [photo(n)]))

afterEach(() => resetPreloadCache())

describe('spreadUrls', () => {
  it('优先 PREVIEW，退化 THUMBNAIL', () => {
    expect(spreadUrls(spread(0, [photo(1)]))).toEqual(['/uploads/m1-preview.jpg'])
    expect(spreadUrls(spread(0, [photo(1, { previewUrl: null })]))).toEqual(['/uploads/m1-thumbnail.jpg'])
  })

  it('左右两页都取', () => {
    const s: BookSpread = {
      id: 's', pageNumber: 1,
      left: page('l', [photo(1)]),
      right: page('r', [photo(2)]),
    }
    expect(spreadUrls(s)).toEqual(['/uploads/m1-preview.jpg', '/uploads/m2-preview.jpg'])
  })

  it('无图 / undefined 跨页返回空', () => {
    expect(spreadUrls(undefined)).toEqual([])
    expect(spreadUrls(spread(0, []))).toEqual([])
  })
})

describe('collectPreloadUrls', () => {
  it('只收集 current ± 1，不含当前跨页自身', () => {
    expect(collectPreloadUrls(spreads, 2)).toEqual([
      '/uploads/m2-preview.jpg',
      '/uploads/m4-preview.jpg',
    ])
  })

  it('首尾不越界', () => {
    expect(collectPreloadUrls(spreads, 0)).toEqual(['/uploads/m2-preview.jpg'])
    expect(collectPreloadUrls(spreads, 4)).toEqual(['/uploads/m4-preview.jpg'])
  })

  it('跳过已解码过的 URL', () => {
    const already = new Set(['/uploads/m2-preview.jpg'])
    expect(collectPreloadUrls(spreads, 2, already)).toEqual(['/uploads/m4-preview.jpg'])
  })

  it('同一 URL 在窗口内只出现一次', () => {
    const dup = [spread(0, [photo(1)]), spread(1, [photo(1), photo(1)])]
    const urls = collectPreloadUrls(dup, 0)
    expect(urls).toEqual(['/uploads/m1-preview.jpg'])
  })

  it('空跨页列表返回空（不抛错）', () => {
    expect(collectPreloadUrls([], 0)).toEqual([])
  })

  it('100 页画册：预热数量有界（不随总页数增长）', () => {
    const many = Array.from({ length: 100 }, (_, i) => spread(i, [photo(i + 1)]))
    expect(collectPreloadUrls(many, 50)).toHaveLength(2)
  })
})

describe('preloadAdjacentSpreads', () => {
  const originalImage = (globalThis as { Image?: unknown }).Image
  const originalWindow = (globalThis as { window?: unknown }).window
  let srcs: string[]

  function stubBrowser() {
    srcs = []
    class FakeImage {
      decoding = ''
      set src(v: string) { srcs.push(v) }
      get src() { return '' }
      decode() { return Promise.resolve() }
    }
    ;(globalThis as { Image?: unknown }).Image = FakeImage
    ;(globalThis as { window?: unknown }).window = { IntersectionObserver: undefined }
  }

  afterEach(() => {
    ;(globalThis as { Image?: unknown }).Image = originalImage
    ;(globalThis as { window?: unknown }).window = originalWindow
  })

  it('无 window（SSR）时不发起任何请求', () => {
    ;(globalThis as { window?: unknown }).window = undefined
    expect(preloadAdjacentSpreads(spreads, 2)).toEqual([])
  })

  it('发起预热的是 ±1 的图，且再次调用不重复解码', () => {
    stubBrowser()
    const first = preloadAdjacentSpreads(spreads, 2)
    expect(first).toEqual(['/uploads/m2-preview.jpg', '/uploads/m4-preview.jpg'])
    expect(srcs).toEqual(first)

    const second = preloadAdjacentSpreads(spreads, 2)
    expect(second).toEqual([])
    expect(srcs).toEqual(first)
  })

  it('向后翻一页：补上窗口新进入的那几张', () => {
    stubBrowser()
    // 窗口 2 → 预热 index1(m2)、index3(m4)
    preloadAdjacentSpreads(spreads, 2)
    // 窗口 3 → 预热 index2(m3)、index4(m5)；m4 已解码 → 跳过
    const next = preloadAdjacentSpreads(spreads, 3)
    expect(next).toEqual(['/uploads/m3-preview.jpg', '/uploads/m5-preview.jpg'])
    expect(srcs).toEqual([
      '/uploads/m2-preview.jpg',
      '/uploads/m4-preview.jpg',
      '/uploads/m3-preview.jpg',
      '/uploads/m5-preview.jpg',
    ])
  })

  it('原地重算（同一 index）不重复发起解码', () => {
    stubBrowser()
    preloadAdjacentSpreads(spreads, 1)
    const again = preloadAdjacentSpreads(spreads, 1)
    expect(again).toEqual([])
    expect(srcs).toHaveLength(2)
  })
})
