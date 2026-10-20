import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * task-33 ③：旅行圈 feed 缓存写后失效（多副本收尾）。
 *
 * 语义：recommended feed 把候选+评分缓存 60s。原来写操作不失效 → 点赞/评论/发帖后最多 60s 旧数据；
 * 多副本下 A 的写只影响 A。现在写后 deleteByTag('social-feed')，读立即重算。
 */

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    travelPost: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    postLike: { findMany: vi.fn() },
    postFavorite: { findMany: vi.fn() },
    userBlock: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

import { listSocialFeed } from '@/lib/modules/social/social.service'
import { SOCIAL_FEED_CACHE_TAG, invalidateSocialFeedCache } from '@/lib/modules/social/feed-cache'
import { memoryCacheService } from '@/lib/infrastructure/cache'

function postRow(title: string) {
  return {
    id: 1,
    title,
    summary: null,
    travelId: null,
    travel: null,
    post: null,
    author: { id: 2, username: 'bob', nickname: null, avatarUrl: null, accountId: null },
    likeCount: 1,
    commentCount: 0,
    favoriteCount: 0,
    publishedAt: new Date().toISOString(),
    visibility: 'PUBLIC',
    authorId: 2,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  memoryCacheService.clear()
  prismaMock.travelPost.count.mockResolvedValue(1)
  prismaMock.travelPost.findMany.mockResolvedValue([postRow('旧标题')])
  prismaMock.postLike.findMany.mockResolvedValue([])
  prismaMock.postFavorite.findMany.mockResolvedValue([])
  prismaMock.userBlock.findMany.mockResolvedValue([])
})

describe('feed 缓存命中与写后失效', () => {
  it('第二次请求命中缓存（不再查库）', async () => {
    await listSocialFeed({ tab: 'recommended', page: 1, pageSize: 10 })
    await listSocialFeed({ tab: 'recommended', page: 1, pageSize: 10 })
    expect(prismaMock.travelPost.findMany).toHaveBeenCalledTimes(1)
  })

  it('写后失效 → 下一次读立即拿到新数据（不再等 60s）', async () => {
    const first = await listSocialFeed({ tab: 'recommended', page: 1, pageSize: 10 })
    expect(first.data[0].title).toBe('旧标题')

    // 模拟一次写操作：数据已变
    prismaMock.travelPost.findMany.mockResolvedValue([postRow('新标题')])
    await invalidateSocialFeedCache()

    const second = await listSocialFeed({ tab: 'recommended', page: 1, pageSize: 10 })
    expect(second.data[0].title).toBe('新标题')
    expect(prismaMock.travelPost.findMany).toHaveBeenCalledTimes(2)
  })

  it('缓存项带 social-feed tag（否则 deleteByTag 无法失效）', async () => {
    await listSocialFeed({ tab: 'recommended', page: 1, pageSize: 10 })
    // 直接删 tag：若缓存没打 tag，这里删不掉，下一次仍走缓存
    await invalidateSocialFeedCache()
    prismaMock.travelPost.findMany.mockResolvedValue([postRow('新标题')])
    const next = await listSocialFeed({ tab: 'recommended', page: 1, pageSize: 10 })
    expect(next.data[0].title).toBe('新标题')
    expect(SOCIAL_FEED_CACHE_TAG).toBe('social-feed')
  })
})
