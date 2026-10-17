import { describe, expect, it } from 'vitest'
import { postPhotoCount, totalPhotoCount } from '@/lib/home/photo-count'
import type { PostMeta } from '@/components/china-map/types'

/**
 * 首页「张数」口径（足迹地图标记 / hero 统计行 / 移动端覆盖条三处共用）。
 * 这些断言是防止三处各写一遍后漂移的唯一护栏。
 */
function post(extra: Partial<PostMeta> = {}): PostMeta {
  return { slug: 's', title: 't', date: '2026-05-01', ...extra }
}

describe('postPhotoCount：一篇文章的照片张数', () => {
  it('images 数组的长度就是张数', () => {
    expect(postPhotoCount(post({ images: ['a.jpg'] }))).toBe(1)
    expect(postPhotoCount(post({ images: ['a.jpg', 'b.jpg', 'c.jpg'] }))).toBe(3)
  })

  it('images 是空数组时是 0 —— 即使有封面（明确"没有照片"不能被封面顶成 1）', () => {
    expect(postPhotoCount(post({ images: [], cover: 'cover.jpg' }))).toBe(0)
  })

  it('旧文章没有 images 字段时退化为封面 1 张（否则会出现"点亮了省份却显示 0 张"）', () => {
    expect(postPhotoCount(post({ cover: 'cover.jpg' }))).toBe(1)
  })

  it('既没有 images 也没有封面 → 0', () => {
    expect(postPhotoCount(post())).toBe(0)
  })
})

describe('totalPhotoCount：首页统计行', () => {
  it('逐篇求和，退化口径同样计入', () => {
    const posts = [
      post({ images: ['a.jpg', 'b.jpg'] }),
      post({ cover: 'cover.jpg' }), // 旧文章 → 1
      post(), // 什么都没有 → 0
      post({ images: ['c.jpg'] }),
    ]
    expect(totalPhotoCount(posts)).toBe(4)
  })

  it('空数组 → 0（新用户首页不显示负数或 NaN）', () => {
    expect(totalPhotoCount([])).toBe(0)
  })
})
