import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 旅行圈详情的数据边界单测（R2）。
 *
 * 这一轮把 `/circle/<id>` 从"封面 + 摘要 + 照片墙"升级成"按天游记"，
 * 于是**多了一条会泄露私密内容的路径**：详情接口现在会读 TravelDay / Memory。
 * 因此必须钉死：
 *   ① 帖子的公开性：非 PUBLIC 且不是作者 → 返回 null（详情页拿不到数据）；
 *   ② 天数据里的回忆**只取 PUBLIC**，私密回忆不进响应；
 *   ③ 私密旅行的封面/照片不随帖子泄露；
 *   ④ 历史 Post 来源的帖子没有天数据（days 为空数组而不是 undefined）。
 */

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    travelPost: { findUnique: vi.fn(), findMany: vi.fn() },
    postLike: { findMany: vi.fn() },
    postFavorite: { findMany: vi.fn() },
    travelDay: { findMany: vi.fn() },
    memory: { findMany: vi.fn() },
    travel: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

import { getSocialPost, getPublicTripDays } from '@/lib/modules/social/social.service'

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)

function travelPostRow(over: Record<string, unknown> = {}) {
  return {
    id: 5,
    travelId: 9,
    authorId: 2,
    visibility: 'PUBLIC',
    title: '大理 3 日',
    summary: '看洱海',
    postId: null,
    coverMediaId: null,
    publishedAt: d(2026, 9, 1),
    likeCount: 0,
    commentCount: 0,
    favoriteCount: 0,
    createdAt: d(2026, 9, 1),
    updatedAt: d(2026, 9, 1),
    travel: {
      id: 9,
      slug: 'dali-3',
      title: '大理 3 日',
      location: '大理',
      startDate: d(2026, 9, 2),
      endDate: d(2026, 9, 4),
      cover: null,
      coverMedia: null,
      _count: { days: 3 },
      days: [],
    },
    post: null,
    author: { id: 2, username: 'author', nickname: '作者', avatarUrl: null },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.postLike.findMany.mockResolvedValue([])
  prismaMock.postFavorite.findMany.mockResolvedValue([])
  prismaMock.travelDay.findMany.mockResolvedValue([])
  prismaMock.memory.findMany.mockResolvedValue([])
  prismaMock.travel.findUnique.mockResolvedValue(null)
})

describe('getSocialPost · 公开性边界', () => {
  it('非 PUBLIC 且不是作者 → null（游客拿不到详情）', async () => {
    prismaMock.travelPost.findUnique.mockResolvedValue(travelPostRow({ visibility: 'SPACE' }))
    expect(await getSocialPost(5, 99)).toBeNull()
    expect(await getSocialPost(5, null)).toBeNull()
  })

  it('非 PUBLIC 但是作者本人 → 可见（自己回看草稿态）', async () => {
    prismaMock.travelPost.findUnique.mockResolvedValue(travelPostRow({ visibility: 'SPACE' }))
    const post = await getSocialPost(5, 2)
    expect(post).not.toBeNull()
    expect(post!.canEdit).toBe(true)
  })

  it('PUBLIC → 游客可见，且 canEdit 为 false', async () => {
    prismaMock.travelPost.findUnique.mockResolvedValue(travelPostRow())
    const post = await getSocialPost(5, null)
    expect(post).not.toBeNull()
    expect(post!.canEdit).toBe(false)
  })

  it('帖子不存在 → null', async () => {
    prismaMock.travelPost.findUnique.mockResolvedValue(null)
    expect(await getSocialPost(404, 1)).toBeNull()
  })
})

describe('getPublicTripDays · 只下发公开回忆', () => {
  it('按天聚合：行程 + 回忆 + 当天照片去重', async () => {
    prismaMock.travelDay.findMany.mockResolvedValue([
      {
        date: d(2026, 9, 2),
        title: 'DAY 01',
        summary: '抵达',
        itineraryItems: [
          { id: 1, title: '洱海', type: 'SPOT', startTime: d(2026, 9, 2), location: { name: '洱海' } },
          { id: 2, title: '机场', type: 'TRANSPORT', startTime: null, location: null },
        ],
        memories: [
          {
            id: 11,
            title: '第一天',
            content: '风很大',
            mood: '开心',
            media: [{ id: 101, type: 'IMAGE', storageKey: 'a.jpg' }],
            mediaLinks: [{ media: { id: 102, type: 'IMAGE', storageKey: 'b.jpg' } }],
          },
          {
            id: 12,
            title: '第二天',
            content: null,
            mood: null,
            // 101 与上一条重复 → 当天照片应去重
            media: [{ id: 101, type: 'IMAGE', storageKey: 'a.jpg' }],
            mediaLinks: [],
          },
        ],
      },
    ])

    const days = await getPublicTripDays(9)
    expect(days).toHaveLength(1)
    expect(days[0].title).toBe('DAY 01')
    expect(days[0].itinerary.map((i) => i.title)).toEqual(['洱海', '机场'])
    expect(days[0].itinerary[0].type).toBe('SPOT')
    expect(days[0].memories).toHaveLength(2)
    expect(days[0].memories[0].photos.map((p) => p.id)).toEqual([101, 102])
    // 当天照片 = 两条回忆的照片去重
    expect(days[0].photos.map((p) => p.id).sort()).toEqual([101, 102])
  })

  it('回忆查询显式要求 visibility = PUBLIC（私密回忆不进响应）', async () => {
    prismaMock.travelDay.findMany.mockResolvedValue([])
    await getPublicTripDays(9)

    const args = prismaMock.travelDay.findMany.mock.calls[0][0] as {
      where: unknown
      include: { memories: { where: unknown } }
    }
    expect(args.where).toEqual({ travelId: 9 })
    expect(args.include.memories.where).toEqual({ visibility: 'PUBLIC' })
  })

  it('没有天数据（历史 Post 来源）→ 空数组，不是 undefined', async () => {
    prismaMock.travelDay.findMany.mockResolvedValue([])
    expect(await getPublicTripDays(9)).toEqual([])
  })

  it('媒体缺少 storageKey 或不是图片时跳过（不产出空 URL）', async () => {
    prismaMock.travelDay.findMany.mockResolvedValue([
      {
        date: null,
        title: null,
        summary: null,
        itineraryItems: [],
        memories: [
          {
            id: 1,
            title: 'x',
            content: null,
            mood: null,
            media: [
              { id: 1, type: 'IMAGE', storageKey: null },
              { id: 2, type: 'VIDEO', storageKey: 'v.mp4' },
            ],
            mediaLinks: [{ media: null }],
          },
        ],
      },
    ])
    const days = await getPublicTripDays(9)
    expect(days[0].photos).toEqual([])
    expect(days[0].memories[0].photos).toEqual([])
  })
})

describe('getSocialPost · days 接线', () => {
  it('绑定 Travel 的帖子带上 days；只有 Post 来源的帖子 days 为空', async () => {
    prismaMock.travelPost.findUnique.mockResolvedValue(travelPostRow())
    prismaMock.travelDay.findMany.mockResolvedValue([
      { date: d(2026, 9, 2), title: 'DAY 01', summary: null, itineraryItems: [], memories: [] },
    ])
    const withTravel = await getSocialPost(5, null)
    expect(withTravel!.days).toHaveLength(1)

    prismaMock.travelPost.findUnique.mockResolvedValue(
      travelPostRow({ travelId: null, travel: null, postId: 77, post: { id: 77, images: null, cover: null } }),
    )
    prismaMock.travelDay.findMany.mockClear()
    const postOnly = await getSocialPost(5, null)
    expect(postOnly!.days).toEqual([])
    // 没有 travelId 时不该去查天数据
    expect(prismaMock.travelDay.findMany).not.toHaveBeenCalled()
  })

  it('天数据查询失败不影响详情返回（降级为空，但必须留日志）', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    prismaMock.travelPost.findUnique.mockResolvedValue(travelPostRow())
    prismaMock.travelDay.findMany.mockRejectedValue(new Error('db down'))
    const post = await getSocialPost(5, null)
    expect(post).not.toBeNull()
    expect(post!.days).toEqual([])
    // 关键：降级可以，静默不可以 —— 原先静默 catch 把一个
    // `Unknown argument 'where'` 变成了"页面没内容、日志也干净"
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('canSuggest 反映登录态（R4 的建议入口先按登录判断）', async () => {
    prismaMock.travelPost.findUnique.mockResolvedValue(travelPostRow())
    expect((await getSocialPost(5, 3))!.canSuggest).toBe(true)
    expect((await getSocialPost(5, null))!.canSuggest).toBe(false)
  })
})
