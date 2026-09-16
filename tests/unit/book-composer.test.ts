import { describe, it, expect } from 'vitest'
import {
  composeBook,
  dedupePhotos,
  scorePhoto,
  type ComposerChapter,
  type ComposerPhoto,
} from '@/lib/modules/album/book/composer'

/**
 * Book Composer 单测（Album 2.0 M1）
 * 覆盖方案 §39 要求的场景：0 / 1 / 2 / 3 / 10 / 100+ 张，
 * 横图 / 竖图 / 方图，有/无 caption、有/无 location、有/无 TravelDay。
 */

/** 显式媒体 id：不用全局自增，保证确定性断言可复现 */
function photo(over: Partial<ComposerPhoto> = {}): ComposerPhoto {
  const id = over.mediaId ?? 1
  return {
    mediaId: id,
    fullUrl: `/uploads/m${id}.jpg`,
    thumbnailUrl: `/uploads/m${id}-thumbnail.jpg`,
    previewUrl: `/uploads/m${id}-preview.jpg`,
    blurUrl: `/uploads/m${id}-blur.jpg`,
    aspect: 1.5,
    takenAt: '2026-05-01T09:00:00.000Z',
    locationName: null,
    ...over,
  }
}

/** 生成 n 张互不重复、时间递减间隔（30 分钟）的照片 */
function photosOf(n: number, over: Partial<ComposerPhoto> = {}): ComposerPhoto[] {
  return Array.from({ length: n }, (_, i) =>
    photo({
      mediaId: i + 1,
      fullUrl: `/uploads/m${i + 1}.jpg`,
      previewUrl: `/uploads/m${i + 1}-preview.jpg`,
      takenAt: new Date(Date.UTC(2026, 4, 1, 6, i * 30)).toISOString(),
      ...over,
    }),
  )
}

function chapter(over: Partial<ComposerChapter> = {}): ComposerChapter {
  return {
    index: 1,
    title: 'DAY 1',
    date: '2026-05-01',
    summary: null,
    itinerary: [],
    photos: [],
    ...over,
  }
}

function compose(chapters: ComposerChapter[], over: Partial<Parameters<typeof composeBook>[0]> = {}) {
  return composeBook({
    bookKey: 'travel:1',
    title: '南京行',
    location: '南京',
    startDate: '2026-05-01',
    endDate: '2026-05-03',
    chapters,
    ...over,
  })
}

const types = (b: ReturnType<typeof composeBook>) => b.pages.map((p) => p.type)

describe('composeBook · 页序与结构', () => {
  it('0 张照片：仍产出封面/前言/日引导/结尾，不含照片页与附录', () => {
    const book = compose([chapter({ index: 1 }), chapter({ index: 2, title: 'DAY 2' })])
    expect(types(book)).toEqual(['COVER', 'OPENING', 'DAY_OPENING', 'DAY_OPENING', 'TIMELINE', 'ENDING'])
    expect(book.stats).toEqual({ selected: 0, total: 0 })
  })

  it('无 TravelDay（chapters 为空）：只有封面/前言/结尾', () => {
    const book = compose([])
    expect(types(book)).toEqual(['COVER', 'OPENING', 'ENDING'])
  })

  it('1 张照片：peak 一页，无附录', () => {
    const book = compose([chapter({ photos: [photo({ mediaId: 1 })] })])
    expect(types(book)).toEqual(['COVER', 'OPENING', 'DAY_OPENING', 'FULL_BLEED', 'ENDING'])
    expect(book.stats).toEqual({ selected: 1, total: 1 })
    expect(book.index).toEqual([])
  })

  it('2 张照片：peak + pause；单章不生成 TIMELINE', () => {
    const book = compose([chapter({ photos: photosOf(2) })])
    expect(types(book)).toEqual(['COVER', 'OPENING', 'DAY_OPENING', 'FULL_BLEED', 'PHOTO_CAPTION', 'ENDING'])
  })

  it('3 张照片：peak + pause + 1 张 echo', () => {
    const book = compose([chapter({ photos: photosOf(3) })])
    const echoPages = book.pages.filter((p) => p.layout?.emphasis === 'echo')
    expect(echoPages).toHaveLength(1)
  })

  it('10 张照片、单章、预算充足：全部进正册，无附录', () => {
    const book = compose([chapter({ photos: photosOf(10) })], { targetPages: 40 })
    expect(book.stats).toEqual({ selected: 10, total: 10 })
    expect(book.index).toEqual([])
    expect(types(book)).not.toContain('INDEX')
  })

  it('100+ 张照片：正册受预算约束，其余全部进 INDEX 附录（一张不丢）', () => {
    const all = Array.from({ length: 120 }, (_, i) =>
      photo({
        mediaId: i + 1,
        fullUrl: `/uploads/m${i + 1}.jpg`,
        previewUrl: `/uploads/m${i + 1}-preview.jpg`,
        takenAt: new Date(Date.UTC(2026, 4, 1 + Math.floor(i / 40), 6, (i % 40) * 20)).toISOString(),
      }),
    )
    const chapters = [
      chapter({ index: 1, date: '2026-05-01', photos: all.slice(0, 40) }),
      chapter({ index: 2, date: '2026-05-02', photos: all.slice(40, 80) }),
      chapter({ index: 3, date: '2026-05-03', photos: all.slice(80) }),
    ]
    const book = compose(chapters, { targetPages: 40 })

    expect(types(book)).toContain('INDEX')
    // 正册 + 附录 = 全部照片（剔除近重复后）
    expect(book.stats.selected + book.index.length).toBe(book.stats.total)
    expect(book.stats.total).toBe(120)
    // 预算硬约束：正册照片页数受限
    expect(book.stats.selected).toBeLessThanOrEqual(40)
    // 附录页每页最多 9 张
    const indexPages = book.pages.filter((p) => p.type === 'INDEX')
    expect(indexPages.length).toBe(Math.ceil(book.index.length / 9))
    for (const p of indexPages) expect(p.photos.length).toBeLessThanOrEqual(9)
  })

  it('多章生成 TIMELINE，且章节按 index 升序', () => {
    const book = compose([
      chapter({ index: 2, title: '第二天', photos: photosOf(2) }),
      chapter({ index: 1, title: '第一天', photos: photosOf(2, { mediaId: 5 }) }),
    ])
    expect(types(book)).toContain('TIMELINE')
    const openings = book.pages.filter((p) => p.type === 'DAY_OPENING')
    expect(openings.map((p) => p.dayIndex)).toEqual([1, 2])
  })
})

describe('composeBook · 横竖屏与跨页出血', () => {
  it('宽高比 ≥1.6 的 peak 打 half=spread（跨页出血）', () => {
    const book = compose([chapter({ photos: [photo({ mediaId: 1, aspect: 2.0 })] })])
    const peak = book.pages.find((p) => p.type === 'FULL_BLEED')!
    expect(peak.half).toBe('spread')
    expect(peak.layout?.variant).toBe('bleed')
  })

  it('竖图 / 4:3 准横图不再跨页（避免裁头脚），保持单页满幅', () => {
    const portrait = compose([chapter({ photos: [photo({ mediaId: 1, aspect: 0.667 })] })])
    expect(portrait.pages.find((p) => p.type === 'FULL_BLEED')!.half).toBeUndefined()

    const nearLandscape = compose([chapter({ photos: [photo({ mediaId: 1, aspect: 1.4 })] })])
    const peak = nearLandscape.pages.find((p) => p.type === 'FULL_BLEED')!
    expect(peak.half).toBeUndefined()
    expect(peak.layout?.variant).toBe('full')
  })

  it('方图按单页处理', () => {
    const book = compose([chapter({ photos: [photo({ mediaId: 1, aspect: 1.0 })] })])
    expect(book.pages.find((p) => p.type === 'FULL_BLEED')!.half).toBeUndefined()
  })
})

describe('composeBook · caption / location / 回忆', () => {
  it('无 caption 无 location 时不产出空字符串字段', () => {
    const book = compose([chapter({ photos: [photo({ mediaId: 1 })] })])
    const peak = book.pages.find((p) => p.type === 'FULL_BLEED')!
    expect(peak.caption).toBeUndefined()
    expect(peak.locationName).toBeUndefined()
  })

  it('有 location 的照片把地点带上页', () => {
    const book = compose([chapter({ photos: [photo({ mediaId: 1, locationName: '中山陵' })] })])
    expect(book.pages.find((p) => p.type === 'FULL_BLEED')!.locationName).toBe('中山陵')
  })

  it('章 summary 作为 PAUSE 页 caption', () => {
    const book = compose([chapter({ summary: '细雨里的城墙', photos: photosOf(2) })])
    const pause = book.pages.find((p) => p.layout?.emphasis === 'pause')!
    expect(pause.caption).toBe('细雨里的城墙')
  })
})

describe('scorePhoto / dedupePhotos', () => {
  it('有回忆绑定 / 有地点的照片得分更高', () => {
    const ctx = { referenceDate: '2026-05-01T09:00:00.000Z', bucketCount: {}, total: 1 }
    const plain = scorePhoto(photo({ mediaId: 1 }), ctx)
    expect(scorePhoto(photo({ mediaId: 1, memoryId: 7 }), ctx)).toBeGreaterThan(plain)
    expect(scorePhoto(photo({ mediaId: 1, locationName: '南京' }), ctx)).toBeGreaterThan(plain)
  })

  it('极端长条构图得分低于 3:2', () => {
    const ctx = { referenceDate: '2026-05-01T09:00:00.000Z', bucketCount: {}, total: 1 }
    expect(scorePhoto(photo({ mediaId: 1, aspect: 1.5 }), ctx))
      .toBeGreaterThan(scorePhoto(photo({ mediaId: 1, aspect: 3.2 }), ctx))
  })

  it('同 URL 只保留一张', () => {
    const a = photo({ mediaId: 1, fullUrl: '/u/same.jpg' })
    const b = photo({ mediaId: 2, fullUrl: '/u/same.jpg', takenAt: '2026-05-01T20:00:00.000Z' })
    expect(dedupePhotos([a, b])).toHaveLength(1)
  })

  it('连拍（8 秒内、同构图方向）视为近重复', () => {
    const a = photo({ mediaId: 1, fullUrl: '/u/a.jpg', takenAt: '2026-05-01T09:00:00.000Z' })
    const b = photo({ mediaId: 2, fullUrl: '/u/b.jpg', takenAt: '2026-05-01T09:00:05.000Z' })
    expect(dedupePhotos([a, b])).toHaveLength(1)
  })

  it('相隔较远的照片不是近重复（不误删真实记录）', () => {
    const a = photo({ mediaId: 1, fullUrl: '/u/a.jpg', takenAt: '2026-05-01T09:00:00.000Z' })
    const b = photo({ mediaId: 2, fullUrl: '/u/b.jpg', takenAt: '2026-05-01T09:05:00.000Z' })
    expect(dedupePhotos([a, b])).toHaveLength(2)
  })

  it('无拍摄时间时不做时间近似判定', () => {
    const a = photo({ mediaId: 1, fullUrl: '/u/a.jpg', takenAt: null })
    const b = photo({ mediaId: 2, fullUrl: '/u/b.jpg', takenAt: null })
    expect(dedupePhotos([a, b])).toHaveLength(2)
  })

  it('确定性：同一输入两次编排完全一致（page-flip 只交付一次页面集合）', () => {
    const mk = () => compose([chapter({ photos: photosOf(12) })])
    expect(JSON.stringify(mk())).toBe(JSON.stringify(mk()))
  })
})
