import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * travel-book.service 聚合逻辑单测（全面体检 Phase A/D 修复的回归防复发）：
 *  - 城市画册章节按日期升序（DAY 01 = 第一天）
 *  - 稳定 bookKey（travel:{id} / city:{城市名}）
 *  - 跨源去重：城市已有 Travel 画册时不再输出该城市 Post 城市画册
 *  - 摘要接口不含章节明细
 */

vi.mock('@/lib/db', () => ({
  prisma: {
    travel: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/visibility', () => ({
  scopedWhere: vi.fn(() => ({})),
}))

vi.mock('@/lib/db-guard', () => ({
  skipDbOnBuild: vi.fn(() => false),
}))

vi.mock('@/lib/container', () => ({
  getPostService: vi.fn(),
}))

vi.mock('@/lib/infrastructure/media-variants', () => ({
  resolveLocalUrlVariants: vi.fn(async (url: string) =>
    url.startsWith('/uploads/')
      ? { thumbnailUrl: url + '?t', previewUrl: url + '?p', blurUrl: url + '?b' }
      : null
  ),
}))

import { prisma } from '@/lib/db'
import { getPostService } from '@/lib/container'
import {
  listTravelBookSummaries,
  getTravelBookByKey,
  listTravelBooks,
} from '@/lib/modules/album/travel-book.service'

const findMany = prisma.travel.findMany as unknown as ReturnType<typeof vi.fn>
const getPostsHybrid = vi.fn()

function travelRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    slug: 'nanjing-trip',
    title: '南京行',
    description: null,
    location: '南京',
    startDate: new Date('2026-05-01'),
    endDate: null,
    travelType: 'COUPLE',
    companions: [{ name: '阿元', relation: '伴侣' }],
    coverMedia: null,
    cover: null,
    days: [],
    ...overrides,
  }
}

// 带一天一忆一图的 Travel（photoCount>0）：只有「有内容」的 Travel 才覆盖同城城市册
function travelRowWithPhoto(overrides: Record<string, unknown> = {}) {
  return travelRow({
    days: [
      {
        id: 11,
        date: new Date('2026-05-01'),
        title: 'DAY 1',
        summary: null,
        itineraryItems: [],
        memories: [
          {
            id: 111,
            title: '初到南京',
            content: null,
            mood: null,
            happenedAt: null,
            media: [{ id: 500, storageKey: 't/1.jpg', variants: [], width: null, height: null }],
            mediaLinks: [],
          },
        ],
      },
    ],
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(getPostService as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ getPostsHybrid })
})

describe('travel-book.service 聚合', () => {
  it('城市画册章节按日期升序（DAY 01 = 第一天）', async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    getPostsHybrid.mockResolvedValue([
      { slug: 'a', title: '第二天', date: '2026-05-02', location: '南京', cover: '/uploads/a.jpg', images: [] },
      { slug: 'b', title: '第一天', date: '2026-05-01', location: '南京', cover: '/uploads/b.jpg', images: [] },
    ])

    const books = await listTravelBooks(1)
    const nj = books.find((b) => b.title === '南京')
    expect(nj).toBeTruthy()
    expect(nj!.chapters.map((c) => c.date)).toEqual(['2026-05-01', '2026-05-02'])
    expect(nj!.chapters[0].index).toBe(1)
  })

  it('bookKey 稳定：travel:{id} / city:{城市名}', async () => {
    findMany.mockResolvedValueOnce([travelRow()]).mockResolvedValueOnce([])
    getPostsHybrid.mockResolvedValue([
      { slug: 'a', title: '苏州记', date: '2026-06-01', location: '苏州', cover: '/uploads/s.jpg', images: [] },
    ])

    const books = await listTravelBooks(1)
    const travelBook = books.find((b) => b.title === '南京行')
    const cityBook = books.find((b) => b.title === '苏州')
    expect(travelBook!.bookKey).toBe('travel:1')
    expect(cityBook!.bookKey).toBe('city:苏州')
  })

  it('跨源去重：城市已有「有内容」的 Travel 画册时不再输出该城市 Post 城市画册', async () => {
    findMany.mockResolvedValueOnce([travelRowWithPhoto()]).mockResolvedValueOnce([])
    getPostsHybrid.mockResolvedValue([
      { slug: 'a', title: '南京记', date: '2026-06-01', location: '南京', cover: '/uploads/n.jpg', images: [] },
      { slug: 'b', title: '苏州记', date: '2026-06-02', location: '苏州', cover: '/uploads/s.jpg', images: [] },
    ])

    const books = await listTravelBooks(1)
    const keys = books.map((b) => b.bookKey)
    expect(keys).not.toContain('city:南京') // Post 城市画册被有内容的 Travel 覆盖
    expect(keys).toContain('travel:1') // Travel 画册保留（title 南京行）
    expect(keys).toContain('city:苏州') // 其他城市不受影响
  })

  it('空壳 Travel（0 章 0 图）不隐藏有内容的 Post 城市画册', async () => {
    findMany.mockResolvedValueOnce([travelRow()]).mockResolvedValueOnce([])
    getPostsHybrid.mockResolvedValue([
      { slug: 'a', title: '南京记', date: '2026-06-01', location: '南京', cover: '/uploads/n.jpg', images: [] },
    ])

    const books = await listTravelBooks(1)
    const keys = books.map((b) => b.bookKey)
    expect(keys).toContain('travel:1') // 空壳 Travel 照常显示
    expect(keys).toContain('city:南京') // 城市册不被空壳覆盖
  })

  it('同一文章的封面与图片去重，photoCount 不重复计', async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    getPostsHybrid.mockResolvedValue([
      {
        slug: 'a',
        title: '杭州记',
        date: '2026-07-01',
        location: '杭州',
        cover: '/uploads/same.jpg',
        images: ['/uploads/same.jpg', '/uploads/other.jpg'],
      },
    ])

    const books = await listTravelBooks(1)
    const hz = books.find((b) => b.title === '杭州')
    expect(hz!.chapters[0].photos.map((p) => p.fullUrl)).toEqual(['/uploads/same.jpg', '/uploads/other.jpg'])
    expect(hz!.photoCount).toBe(2)
  })

  it('摘要接口不含章节明细，dayCount 有兜底', async () => {
    // 无 Post 时城市聚合提前返回，不发起第二次 findMany（只消费 1 个 Once）
    findMany.mockResolvedValueOnce([travelRow({ days: [] })])
    getPostsHybrid.mockResolvedValue([])

    const summaries = await listTravelBookSummaries(1)
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).not.toHaveProperty('chapters')
    expect(summaries[0].dayCount).toBe(0)
  })

  it('getTravelBookByKey 按 bookKey 取单本全书', async () => {
    // getTravelBookByKey 每次调用都会重跑一次聚合；无 Post 时城市聚合提前返回（仅 1 次 findMany）。
    // 用持久 mock 而非 Once，避免多次调用间的队列错位。
    findMany.mockResolvedValue([travelRow()])
    getPostsHybrid.mockResolvedValue([])

    const book = await getTravelBookByKey('travel:1', 1)
    expect(book).toBeTruthy()
    expect(book!.title).toBe('南京行')
    expect(book!.chapters).toEqual([])

    expect(await getTravelBookByKey('travel:404', 1)).toBeNull()
    expect(await getTravelBookByKey('', 1)).toBeNull()
  })
})
