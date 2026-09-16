import { describe, it, expect } from 'vitest'
import {
  composeFromSourceBook,
  toComposerChapter,
  toSpreads,
  FALLBACK_ASPECT,
  type SourceBook,
  type SourceChapter,
} from '@/lib/modules/album/book/mapper'

/**
 * mapper 单测（Album 2.0 M1）
 * 守住：API 形状 → 画册编排的映射口径，尤其是**宽高比缺失时的安全降级**。
 */

function sourcePhoto(id: number, over: Partial<SourceChapter['photos'][number]> = {}) {
  return {
    id,
    thumbnailUrl: `/uploads/m${id}-thumbnail.jpg`,
    previewUrl: `/uploads/m${id}-preview.jpg`,
    blurUrl: `/uploads/m${id}-blur.jpg`,
    fullUrl: `/uploads/m${id}.jpg`,
    width: 1600,
    height: 1067,
    ...over,
  }
}

function sourceChapter(over: Partial<SourceChapter> = {}): SourceChapter {
  return {
    id: 11,
    index: 1,
    date: '2026-05-01',
    title: 'DAY 1',
    summary: null,
    itinerary: [],
    memories: [],
    photos: [],
    ...over,
  }
}

function sourceBook(chapters: SourceChapter[]): SourceBook {
  return {
    bookKey: 'travel:1',
    travelId: 1,
    title: '南京行',
    description: null,
    location: '南京',
    startDate: '2026-05-01',
    endDate: '2026-05-02',
    coverThumb: '/uploads/cover-thumbnail.jpg',
    coverPreview: '/uploads/cover-preview.jpg',
    coverBlur: '/uploads/cover-blur.jpg',
    photoCount: chapters.reduce((n, c) => n + c.photos.length, 0),
    chapters,
  }
}

describe('toComposerChapter', () => {
  it('宽高比由服务端 width/height 推出', () => {
    const ch = toComposerChapter(sourceChapter({ photos: [sourcePhoto(1, { width: 2000, height: 1000 })] }))
    expect(ch.photos[0].aspect).toBe(2)
  })

  it('宽高比缺失时用安全缺省（竖向），绝不被判定为跨页出血', () => {
    const ch = toComposerChapter(
      sourceChapter({ photos: [sourcePhoto(1, { width: null, height: null })] }),
    )
    expect(ch.photos[0].aspect).toBe(FALLBACK_ASPECT)
    expect(ch.photos[0].aspect).toBeLessThan(1.6)
  })

  it('宽或高为 0 也回退到安全缺省（不产生 Infinity / NaN）', () => {
    const ch = toComposerChapter(
      sourceChapter({ photos: [sourcePhoto(1, { width: 0, height: 1000 }), sourcePhoto(2, { width: 1600, height: 0 })] }),
    )
    expect(ch.photos.map((p) => p.aspect)).toEqual([FALLBACK_ASPECT, FALLBACK_ASPECT])
  })

  it('照片按回忆绑定标记 memoryId（"有故事的照片优先入选"）', () => {
    const ch = toComposerChapter(sourceChapter({
      photos: [sourcePhoto(1), sourcePhoto(2)],
      memories: [{ id: 77, title: '城墙', content: null, mood: null, photos: [sourcePhoto(2)] }],
    }))
    const byId = new Map(ch.photos.map((p) => [p.mediaId, p]))
    expect(byId.get(2)!.memoryId).toBe(77)
    expect(byId.get(1)!.memoryId).toBeNull()
  })

  it('同一张照片在章内去重（封面 == images[0] 之类的重复）', () => {
    const ch = toComposerChapter(sourceChapter({ photos: [sourcePhoto(1), sourcePhoto(1)] }))
    expect(ch.photos).toHaveLength(1)
  })

  it('地点退到本章第一个有地点的行程点，不逐张编造', () => {
    const ch = toComposerChapter(sourceChapter({
      photos: [sourcePhoto(1)],
      itinerary: [
        { id: 1, title: '出发', locationName: null },
        { id: 2, title: '中山陵', locationName: '中山陵' },
      ],
    }))
    expect(ch.photos[0].locationName).toBe('中山陵')
  })
})

describe('composeFromSourceBook', () => {
  it('封面照片来自 cover* 字段，且不占用章节照片', () => {
    const book = composeFromSourceBook(sourceBook([sourceChapter({ photos: [sourcePhoto(1)] })]))
    const cover = book.pages[0]
    expect(cover.type).toBe('COVER')
    expect(cover.photos).toHaveLength(1)
    expect(cover.photos[0].previewUrl).toBe('/uploads/cover-preview.jpg')
    expect(book.stats.total).toBe(1)
  })

  it('无封面照片时封面页仍存在（不因缺图丢页）', () => {
    const book = composeFromSourceBook({
      ...sourceBook([sourceChapter({ photos: [sourcePhoto(1)] })]),
      coverThumb: null, coverPreview: null, coverBlur: null,
    })
    expect(book.pages[0].type).toBe('COVER')
    expect(book.pages[0].photos).toEqual([])
  })

  it('空画册（无章节）不抛错，产出 封面/前言/结尾', () => {
    const book = composeFromSourceBook({ ...sourceBook([]), coverThumb: null, coverPreview: null, coverBlur: null })
    expect(book.pages.map((p) => p.type)).toEqual(['COVER', 'OPENING', 'ENDING'])
  })
})

describe('toSpreads', () => {
  it('单页 / 双页两种模式都产出 BookSpread 结构，且页码都从 1 开始', () => {
    const book = composeFromSourceBook(sourceBook([sourceChapter({ photos: [sourcePhoto(1), sourcePhoto(2)] })]))
    const single = toSpreads(book.pages, 'single')
    const dual = toSpreads(book.pages, 'dual')
    expect(single[0].pageNumber).toBe(1)
    expect(dual[0].pageNumber).toBe(1)
    expect(single.every((s) => s.left === null)).toBe(true)
    expect(dual.length).toBeLessThanOrEqual(single.length)
  })
})
