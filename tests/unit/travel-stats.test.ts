import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 统计口径唯一事实源单测（R3）。
 *
 * 背景：`/api/me` 与 `/api/dashboard` 原先各写一份统计、各读一张表
 * （Travel vs Post），于是同一批数据在「我的」显示 0、在「看板」显示别的数字。
 * 现在两处都走 `getTravelArchiveStats`，这里锁住它的三条规则：
 *   ① 有 Travel 时以 Travel 为准（App 里「+ 新建旅行」写的就是它）；
 *   ② 没有 Travel 但有旧文章时**用旧文章兜底**（存量单管理员数据不能变成一片 0）；
 *   ③ 城市去重、照片跨旅行去重。
 */

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    travel: { findMany: vi.fn() },
    post: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

import { getTravelArchiveStats, diffInDays } from '@/lib/modules/travel/travel-stats'

function media(id: number) {
  return {
    id,
    type: 'IMAGE',
    storageKey: `media/${id}.jpg`,
    variants: [{ variant: 'THUMBNAIL', storageKey: `media/${id}-thumbnail.jpg` }],
  }
}

function travelRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: '旅行',
    slug: 'travel',
    location: null,
    startDate: null,
    endDate: null,
    status: 'PLANNED',
    cover: null,
    companions: null,
    coverMedia: null,
    days: [],
    ...over,
  }
}

function postRow(over: Record<string, unknown> = {}) {
  return { id: 1, title: '旧文章', slug: 'old', location: null, date: null, cover: null, images: null, ...over }
}

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.travel.findMany.mockResolvedValue([])
  prismaMock.post.findMany.mockResolvedValue([])
})

describe('有 Travel 时以 Travel 为准', () => {
  it('travelCount / placeCount / photoCount 来自 Travel', async () => {
    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({ id: 1, location: '大理', startDate: d(2026, 3, 1), endDate: d(2026, 3, 3) }),
      travelRow({ id: 2, location: '大理', startDate: d(2026, 5, 1) }),
      travelRow({ id: 3, location: '成都', startDate: d(2026, 7, 1) }),
    ])
    // 旧文章故意给一堆，验证"有 Travel 就完全不看它"
    prismaMock.post.findMany.mockResolvedValue([postRow(), postRow({ id: 2 })])

    const s = await getTravelArchiveStats(7)
    expect(s.travelCount).toBe(3)
    expect(s.placeCount).toBe(2) // 大理去重
    expect(s.source.used).toBe('travel')
    expect(s.source.legacyPosts).toBe(2) // 仍然统计出来供排查
  })

  it('照片跨旅行去重（含 mediaLinks 关联图）', async () => {
    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({ id: 1, startDate: d(2026, 3, 1), days: [{ memories: [{ media: [media(11), media(12)], mediaLinks: [] }] }] }),
      travelRow({
        id: 2,
        startDate: d(2026, 4, 1),
        days: [{ memories: [{ media: [media(11)], mediaLinks: [{ media: media(13) }] }] }],
      }),
    ])
    const s = await getTravelArchiveStats(7)
    expect(s.photoCount).toBe(3) // 11, 12, 13
  })

  it('封面计入照片，且取缩略图变体', async () => {
    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({
        id: 1,
        startDate: d(2026, 3, 1),
        coverMedia: { storageKey: 'covers/a.jpg', variants: [{ variant: 'THUMBNAIL', storageKey: 'covers/a-thumb.jpg' }] },
      }),
    ])
    const s = await getTravelArchiveStats(7)
    expect(s.photoCount).toBe(1)
  })

  it('travelDays 只算有起止日的旅行；全无日期时为 null', async () => {
    prismaMock.travel.findMany.mockResolvedValue([travelRow({ id: 1, startDate: null })])
    expect((await getTravelArchiveStats(7)).travelDays).toBeNull()

    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({ id: 1, startDate: d(2026, 3, 1), endDate: d(2026, 3, 3) }), // 3
      travelRow({ id: 2, startDate: d(2026, 4, 1), endDate: null }), // 1
    ])
    expect((await getTravelArchiveStats(7)).travelDays).toBe(4)
  })

  it('省份按省去重（南京+苏州同属江苏 → 1 省）', async () => {
    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({ id: 1, location: '南京', startDate: d(2026, 3, 1) }),
      travelRow({ id: 2, location: '苏州', startDate: d(2026, 4, 1) }),
    ])
    const s = await getTravelArchiveStats(7)
    expect(s.placeCount).toBe(2)
    expect(s.provinceCount).toBe(1)
  })
})

describe('没有 Travel 时用旧文章兜底', () => {
  it('travelCount / placeCount / photoCount 来自 Post', async () => {
    prismaMock.post.findMany.mockResolvedValue([
      postRow({ id: 1, location: '北京', cover: '12', images: '["13","14"]' }),
      postRow({ id: 2, location: '北京', cover: null, images: '["13"]' }), // 13 重复
      postRow({ id: 3, location: '上海', cover: null, images: null }),
    ])
    const s = await getTravelArchiveStats(7)
    expect(s.travelCount).toBe(3)
    expect(s.placeCount).toBe(2) // 北京 / 上海
    expect(s.photoCount).toBe(3) // 12, 13, 14 去重
    expect(s.source.used).toBe('legacy')
    expect(s.source.travelRows).toBe(0)
  })

  it('封面是完整 URL 时也能解析', async () => {
    prismaMock.post.findMany.mockResolvedValue([
      postRow({ id: 1, location: '广州', cover: 'https://cdn.example.com/x.jpg', images: null }),
    ])
    expect((await getTravelArchiveStats(7)).photoCount).toBe(1)
  })

  it('两者都没有 → 全 0（这是"用户确实还没记过旅行"的正确表现）', async () => {
    const s = await getTravelArchiveStats(7)
    expect(s).toMatchObject({ travelCount: 0, placeCount: 0, photoCount: 0, provinceCount: 0 })
    // 无 Travel 时 used 落在 legacy（只是 legacy 也为 0）
    expect(s.source.used).toBe('legacy')
  })

  it('旧文章列表查询失败时降级为空，不抛错', async () => {
    prismaMock.post.findMany.mockRejectedValue(new Error('db down'))
    prismaMock.travel.findMany.mockResolvedValue([])
    const s = await getTravelArchiveStats(7)
    expect(s.travelCount).toBe(0)
  })

  it('Travel 查询失败时用旧文章兜底', async () => {
    prismaMock.travel.findMany.mockRejectedValue(new Error('db down'))
    prismaMock.post.findMany.mockResolvedValue([postRow({ location: '杭州' })])
    const s = await getTravelArchiveStats(7)
    expect(s.travelCount).toBe(1)
    expect(s.source.used).toBe('legacy')
  })
})

describe('diffInDays', () => {
  it('按整天计算', () => {
    expect(diffInDays(d(2026, 9, 17), d(2026, 9, 17))).toBe(0)
    expect(diffInDays(d(2026, 9, 30), d(2026, 10, 2))).toBe(2)
  })
})
