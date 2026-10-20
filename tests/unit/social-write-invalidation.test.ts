import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * task-33 ③：写操作必须使旅行圈 feed 缓存失效（多副本收尾）。
 * 这里 mock feed-cache 模块，断言点赞/收藏/评论/删评/改标题/屏蔽 都调用了失效。
 */

const { invalidateMock, feedCacheMock, prismaMock } = vi.hoisted(() => ({
  invalidateMock: vi.fn(async () => {}),
  feedCacheMock: { get: vi.fn(async () => null), set: vi.fn(async () => {}), deleteByTag: vi.fn(async () => {}) },
  prismaMock: {
    travelPost: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    postLike: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
    postFavorite: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
    comment: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    commentLike: { findMany: vi.fn() },
    notification: { create: vi.fn() },
    userBlock: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))
vi.mock('@/lib/modules/social/feed-cache', () => ({
  SOCIAL_FEED_CACHE_TAG: 'social-feed',
  SOCIAL_FEED_CACHE_TTL_SECONDS: 60,
  getSocialFeedCache: () => feedCacheMock,
  invalidateSocialFeedCache: invalidateMock,
}))

import {
  setPostLike,
  setPostFavorite,
  createPostComment,
  deletePostComment,
  updateSocialPost,
  blockUser,
} from '@/lib/modules/social/social.service'

const txMock = {
  postLike: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) },
  postFavorite: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) },
  travelPost: { update: vi.fn(async () => ({ likeCount: 1, favoriteCount: 1 })), findUnique: vi.fn(async () => ({ likeCount: 1, favoriteCount: 1 })) },
  comment: { create: vi.fn(async () => ({ id: 9 })), update: vi.fn(async () => ({})) },
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(txMock))
  prismaMock.notification.create.mockResolvedValue({})
  prismaMock.travelPost.findUnique.mockResolvedValue({
    id: 1,
    authorId: 2,
    postId: null,
    travelId: null,
    title: 't',
    summary: null,
    visibility: 'PUBLIC',
    likeCount: 1,
    commentCount: 0,
    favoriteCount: 0,
    publishedAt: new Date().toISOString(),
    travel: null,
    post: null,
    author: null,
  })
  prismaMock.postLike.findMany.mockResolvedValue([])
  prismaMock.postFavorite.findMany.mockResolvedValue([])
})

describe('写操作 → feed 缓存失效', () => {
  it('点赞（状态真的变化）后失效', async () => {
    await setPostLike(1, 3, true)
    expect(invalidateMock).toHaveBeenCalledTimes(1)
  })

  it('收藏后失效', async () => {
    await setPostFavorite(1, 3, true)
    expect(invalidateMock).toHaveBeenCalledTimes(1)
  })

  it('发评论后失效', async () => {
    prismaMock.comment.findUnique.mockResolvedValue({
      id: 9,
      postId: 1,
      userId: 3,
      parentId: null,
      content: 'hi',
      status: 'VISIBLE',
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { id: 3, username: 'u', nickname: null, avatarUrl: null, accountId: null },
      _count: { likes: 0 },
    })
    await createPostComment({ postId: 1, userId: 3, content: 'hi' })
    expect(invalidateMock).toHaveBeenCalledTimes(1)
  })

  it('删评论后失效', async () => {
    prismaMock.comment.findUnique.mockResolvedValue({ id: 5, userId: 3, postId: 1, status: 'VISIBLE' })
    await deletePostComment(5, 3)
    expect(invalidateMock).toHaveBeenCalledTimes(1)
  })

  it('编辑帖子标题后失效（feed 卡片内容变了）', async () => {
    const updated = await updateSocialPost(1, 2, { title: '新标题' })
    expect(updated).toBeTruthy()
    expect(invalidateMock).toHaveBeenCalledTimes(1)
  })

  it('屏蔽作者后失效（feed 可见集合变了）', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 2 })
    prismaMock.userBlock.upsert.mockResolvedValue({})
    await blockUser(3, 2)
    expect(invalidateMock).toHaveBeenCalledTimes(1)
  })
})
