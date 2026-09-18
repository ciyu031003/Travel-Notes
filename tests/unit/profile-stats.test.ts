import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 「我的」页统计口径单测（R1 核心修复的回归防护）。
 *
 * 修复前：`travelCount / placeCount / photoCount` 读的是 `Post(type='travel')`（旧文章模型），
 * 而 App 里「+ 新建旅行」写的是 `Travel` 表 → **用户在前台建的旅行一个都不计入**，
 * 三个数字偏低甚至为 0。
 *
 * 这里锁住四条语义：
 *   ① 我名下的 Travel 计入（不再看 Post）；
 *   ② 只统计我名下（不把别人/空间成员的旅行算成"我去了多少地方"）；
 *   ③ 同一城市多趟旅行只算 1 个地方（拍板：城市去重）；
 *   ④ 同一张照片挂多本旅行只算 1 张。
 */

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    travel: { findMany: vi.fn() },
    moment: { count: vi.fn() },
    postFavorite: { count: vi.fn() },
    travelPost: { aggregate: vi.fn() },
    spaceMember: { findMany: vi.fn() },
    post: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))
vi.mock('@/lib/modules/space/permissions', () => ({
  getUserCapabilities: vi.fn(async () => ({
    isOwner: true,
    canManageContent: true,
    canManageSocial: true,
    canManageSettings: true,
    canManageSpace: true,
    canViewAudit: true,
  })),
}))
vi.mock('@/lib/current-user', () => ({ invalidateCurrentUserCache: vi.fn() }))

import { getMyProfile, diffInDays } from '@/lib/modules/social/profile.service'

function media(id: number) {
  return {
    id,
    storageKey: `media/${id}.jpg`,
    variants: [{ variant: 'THUMBNAIL', storageKey: `media/${id}-thumbnail.jpg` }],
  }
}

function memoryWith(mediaIds: number[], linkedIds: number[] = []) {
  return {
    media: mediaIds.map(media),
    mediaLinks: linkedIds.map((id) => ({ media: media(id) })),
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

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.user.findUnique.mockResolvedValue({
    id: 7,
    username: 'me',
    nickname: '我',
    bio: null,
    avatarUrl: null,
    coverUrl: null,
    coverFocusX: null,
    coverFocusY: null,
    accountId: '12345678',
    createdAt: d(2026, 1, 1),
  })
  prismaMock.moment.count.mockResolvedValue(0)
  prismaMock.postFavorite.count.mockResolvedValue(0)
  prismaMock.travelPost.aggregate.mockResolvedValue({ _sum: { likeCount: 0 } })
  prismaMock.post.findMany.mockResolvedValue([])
})

describe('getMyProfile · 统计口径', () => {
  it('以 Travel 为准：新增一本旅行后 travelCount +1（修复前恒为 0）', async () => {
    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({ id: 1, title: '大理', slug: 'dali', location: '大理', startDate: d(2026, 3, 1), endDate: d(2026, 3, 3) }),
    ])

    const p = await getMyProfile(7)
    expect(p!.summary.travelCount).toBe(1)
    // 关键：统计查的是 Travel 表（ownerId = 我）
    const where = (prismaMock.travel.findMany.mock.calls[0][0] as { where: unknown }).where
    expect(where).toEqual({ ownerId: 7 })
    // 数字必须来自 Travel：R3 之后旧文章仍会被查询（用于"兜底是否可用"的诊断字段），
    // 但只要 Travel 有数据，就**不许**用它的结果。
    expect(p!.summary.source.used).toBe('travel')
  })

  it('只统计我名下的旅行（不按空间展开）', async () => {
    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({ id: 1, location: '大理', startDate: d(2026, 3, 1) }),
      travelRow({ id: 2, location: '丽江', startDate: d(2026, 4, 1) }),
    ])
    const p = await getMyProfile(7)
    const where = (prismaMock.travel.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where
    expect(where.spaceId).toBeUndefined()
    expect(where.OR).toBeUndefined()
    expect(p!.summary.travelCount).toBe(2)
    expect(p!.summary.placeCount).toBe(2)
  })

  it('同一城市去重：三趟大理只算 1 个地方', async () => {
    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({ id: 1, location: '大理', startDate: d(2026, 3, 1) }),
      travelRow({ id: 2, location: '大理', startDate: d(2026, 5, 1) }),
      travelRow({ id: 3, location: ' 大理 ', startDate: d(2026, 7, 1) }),
    ])
    const p = await getMyProfile(7)
    expect(p!.summary.travelCount).toBe(3)
    expect(p!.summary.placeCount).toBe(1)
  })

  it('没填目的地的旅行不计入地方数', async () => {
    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({ id: 1, location: null, startDate: d(2026, 3, 1) }),
      travelRow({ id: 2, location: '   ', startDate: d(2026, 3, 5) }),
      travelRow({ id: 3, location: '成都', startDate: d(2026, 3, 9) }),
    ])
    expect((await getMyProfile(7))!.summary.placeCount).toBe(1)
  })

  it('照片去重：同一张图挂两本旅行只算 1 张（含 mediaLinks 关联）', async () => {
    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({ id: 1, startDate: d(2026, 3, 1), days: [{ memories: [memoryWith([11, 12])] }] }),
      travelRow({ id: 2, startDate: d(2026, 4, 1), days: [{ memories: [memoryWith([11], [13])] }] }),
    ])
    expect((await getMyProfile(7))!.summary.photoCount).toBe(3) // 11, 12, 13
  })

  it('封面计入照片数，且取缩略图变体', async () => {
    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({
        id: 1,
        startDate: d(2026, 3, 1),
        coverMedia: { storageKey: 'covers/a.jpg', variants: [{ variant: 'THUMBNAIL', storageKey: 'covers/a-thumb.jpg' }] },
      }),
    ])
    const p = await getMyProfile(7)
    expect(p!.summary.photoCount).toBe(1)
    expect(p!.recentTravel!.coverUrl).toContain('covers/a-thumb.jpg')
  })

  it('travelDays 只统计有起止日的旅行（无日期时为 null）', async () => {
    prismaMock.travel.findMany.mockResolvedValue([travelRow({ id: 1, startDate: null })])
    expect((await getMyProfile(7))!.summary.travelDays).toBeNull()

    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({ id: 1, startDate: d(2026, 3, 1), endDate: d(2026, 3, 3) }), // 3 天
      travelRow({ id: 2, startDate: d(2026, 4, 1), endDate: null }), // 1 天
    ])
    expect((await getMyProfile(7))!.summary.travelDays).toBe(4)
  })

  it('省份数按省份去重（同省两城算 1 省）', async () => {
    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({ id: 1, location: '南京', startDate: d(2026, 3, 1) }),
      travelRow({ id: 2, location: '苏州', startDate: d(2026, 4, 1) }),
      travelRow({ id: 3, location: '成都', startDate: d(2026, 5, 1) }),
    ])
    const p = await getMyProfile(7)
    expect(p!.summary.placeCount).toBe(3)
    expect(p!.summary.provinceCount).toBeGreaterThanOrEqual(2)
  })

  it('头图与焦点原样下发（供 object-position 渲染）', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 7,
      username: 'me',
      nickname: null,
      bio: null,
      avatarUrl: null,
      coverUrl: '/uploads/covers/c-1.webp',
      coverFocusX: 0.5,
      coverFocusY: 0.1667,
      accountId: null,
      createdAt: d(2026, 1, 1),
    })
    prismaMock.travel.findMany.mockResolvedValue([])
    const p = await getMyProfile(7)
    expect(p!.coverUrl).toContain('/uploads/covers/c-1.webp')
    expect(p!.coverFocusX).toBe(0.5)
    expect(p!.coverFocusY).toBeCloseTo(0.1667)
  })
})

describe('getMyProfile · 最近 / 下一趟', () => {
  it('已结束的旅行不再占「最近的一次旅行」', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(d(2026, 9, 17))
    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({ id: 1, title: '去年', location: '西安', startDate: d(2025, 5, 1), endDate: d(2025, 5, 5) }),
      travelRow({ id: 2, title: '未来', location: '大理', startDate: d(2026, 12, 1), endDate: d(2026, 12, 5) }),
    ])
    const p = await getMyProfile(7)
    expect(p!.recentTravel!.title).toBe('未来')
    expect(p!.upcomingTravel!.title).toBe('未来')
    expect(p!.upcomingTravel!.daysUntilStart).toBeGreaterThan(0)
    vi.useRealTimers()
  })

  it('取最近一趟未来的旅行作为「下一趟」，0 表示今天出发', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(d(2026, 9, 17))
    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({ id: 1, title: '今天走', startDate: d(2026, 9, 17) }),
      travelRow({ id: 2, title: '下个月', startDate: d(2026, 10, 20) }),
      travelRow({ id: 3, title: '过去', startDate: d(2026, 1, 1), endDate: d(2026, 1, 3) }),
    ])
    const p = await getMyProfile(7)
    expect(p!.upcomingTravel!.title).toBe('今天走')
    expect(p!.upcomingTravel!.daysUntilStart).toBe(0)
    vi.useRealTimers()
  })

  it('没有未来旅行时 upcomingTravel 为 null', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(d(2026, 9, 17))
    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({ id: 1, title: '过去', startDate: d(2026, 1, 1), endDate: d(2026, 1, 3) }),
    ])
    expect((await getMyProfile(7))!.upcomingTravel).toBeNull()
    vi.useRealTimers()
  })
})

describe('getMyProfile · 同行者聚合', () => {
  it('按姓名去重计数，并保留首次出现的关系', async () => {
    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({ id: 1, startDate: d(2026, 3, 1), companions: [{ name: '小明', relation: '朋友' }] }),
      travelRow({ id: 2, startDate: d(2026, 4, 1), companions: [{ name: '小明' }, { name: '小红', relation: '伴侣' }] }),
    ])
    const p = await getMyProfile(7)
    const byName = Object.fromEntries(p!.companionStats.map((c) => [c.name, c]))
    expect(byName['小明'].count).toBe(2)
    expect(byName['小明'].relation).toBe('朋友')
    expect(byName['小红'].count).toBe(1)
  })

  it('空姓名与非法 companions 不炸', async () => {
    prismaMock.travel.findMany.mockResolvedValue([
      travelRow({ id: 1, startDate: d(2026, 3, 1), companions: [{ name: '  ' }, { relation: 'x' }] }),
      travelRow({ id: 2, startDate: d(2026, 4, 1), companions: 'not-an-array' }),
    ])
    expect((await getMyProfile(7))!.companionStats).toEqual([])
  })
})

describe('diffInDays', () => {
  it('按整天计算，跨月与同日都为 0', () => {
    expect(diffInDays(d(2026, 9, 17), d(2026, 9, 17))).toBe(0)
    expect(diffInDays(d(2026, 9, 17), d(2026, 9, 20))).toBe(3)
    expect(diffInDays(d(2026, 9, 30), d(2026, 10, 2))).toBe(2)
    expect(diffInDays(d(2026, 9, 17), d(2026, 9, 16))).toBe(-1)
  })
})
