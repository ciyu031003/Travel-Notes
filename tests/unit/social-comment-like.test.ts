import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 评论点赞的服务端语义单测（2026-10-17）。
 *
 * 为什么必须钉住：这个接口最初两个分支（POST / DELETE）都调 `toggleCommentLike`，
 * 也就是**两边都是"翻一下"**。后果是用户点一次赞失败后重试，赞反而被撤销 ——
 * 而客户端做乐观更新 + 失败重试是常态。改成幂等（确保已赞 / 确保未赞）之后，
 * 重放与重试才是安全的；同时也让「评论点赞」这个功能在客户端接得上
 * （此前没有任何客户端代码调用它，接口等于摆设）。
 */

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    comment: { findUnique: vi.fn() },
    commentLike: { upsert: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

import { setCommentLike } from '@/lib/modules/social/social.service'

describe('setCommentLike · 幂等（不是 toggle）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.comment.findUnique.mockResolvedValue({ id: 5 })
    prismaMock.commentLike.count.mockResolvedValue(3)
  })

  it('liked=true → upsert：已赞状态下重复调用不会取消赞', async () => {
    await expect(setCommentLike(5, 7, true)).resolves.toEqual({ liked: true, likeCount: 3 })
    expect(prismaMock.commentLike.upsert).toHaveBeenCalledWith({
      where: { commentId_userId: { commentId: 5, userId: 7 } },
      update: {},
      create: { commentId: 5, userId: 7 },
    })
    expect(prismaMock.commentLike.deleteMany).not.toHaveBeenCalled()
  })

  it('liked=false → deleteMany：未赞状态下重复调用同样安静（不抛"记录不存在"）', async () => {
    await expect(setCommentLike(5, 7, false)).resolves.toEqual({ liked: false, likeCount: 3 })
    expect(prismaMock.commentLike.deleteMany).toHaveBeenCalledWith({ where: { commentId: 5, userId: 7 } })
    expect(prismaMock.commentLike.upsert).not.toHaveBeenCalled()
  })

  it('返回服务端真实的 likeCount（客户端乐观更新后据此对齐，避免"我算的"和库里不一样）', async () => {
    prismaMock.commentLike.count.mockResolvedValue(42)
    await expect(setCommentLike(5, 7, true)).resolves.toEqual({ liked: true, likeCount: 42 })
    expect(prismaMock.commentLike.count).toHaveBeenCalledWith({ where: { commentId: 5 } })
  })

  it('评论不存在 → 明确报错（不做静默成功）', async () => {
    prismaMock.comment.findUnique.mockResolvedValue(null)
    await expect(setCommentLike(999, 7, true)).rejects.toThrow('评论不存在')
    expect(prismaMock.commentLike.upsert).not.toHaveBeenCalled()
  })
})
