import { describe, it, expect } from 'vitest'
import {
  SOCIAL_FEED_CACHE_MAX_BYTES,
  SOCIAL_FEED_CACHE_MAX_POSTS,
  SOCIAL_FEED_CACHE_SCHEMA_VERSION,
  feedPostTime,
  measureFeedCacheBytes,
  mergeFeedCacheItems,
  normalizeFeedCachePost,
  parseFeedCacheSnapshot,
  sortFeedCacheItems,
  trimFeedCacheItems,
  type FeedCachePost,
} from '@/lib/modules/offline/social-feed-cache'

/**
 * 旅行圈「预缓存」（P2 · 客户端本地缓存层）纯逻辑单测。
 *
 * 注意与 tests/unit/social-feed-cache.test.ts 区分：那个测的是**服务端**
 * recommended feed 的 60s 缓存失效；这里测的是**客户端** IndexedDB/SQLite
 * 缓存的校验与淘汰（结构版本 / publishedAt 排序 / 合并去重 / 60 篇 & 3MB 双上限）。
 * 这些逻辑错了页面不会报错，只会静默地「离线内容错乱 / 缓存永不收敛 / 旧账号串号」。
 */

function post(id: number, publishedAt: string, extra: Partial<FeedCachePost> = {}): FeedCachePost {
  return {
    id,
    title: 'post ' + id,
    summary: null,
    coverUrl: null,
    location: null,
    startDate: null,
    endDate: null,
    dayCount: 0,
    photoCount: 0,
    travelType: null,
    author: { id: 1, username: 'u', nickname: null, avatarUrl: null },
    likeCount: 0,
    commentCount: 0,
    favoriteCount: 0,
    isLiked: false,
    isFavorited: false,
    publishedAt,
    ...extra,
  }
}

function iso(daysAgo: number): string {
  return new Date(Date.UTC(2026, 0, 1) - daysAgo * 24 * 3600 * 1000).toISOString()
}

describe('normalizeFeedCachePost（字段结构校验）', () => {
  it('id 非法/缺失的条目判为无效（整份缓存据此作废重拉）', () => {
    expect(normalizeFeedCachePost(null)).toBeNull()
    expect(normalizeFeedCachePost({})).toBeNull()
    expect(normalizeFeedCachePost({ id: 0, title: 'x' })).toBeNull()
    expect(normalizeFeedCachePost({ id: 'abc', title: 'x' })).toBeNull()
  })

  it('合法条目补齐默认值并保留 publishedAt（用于排序 / 下线修剪）', () => {
    const normalized = normalizeFeedCachePost({ id: 7, title: '大理', publishedAt: iso(1) })
    expect(normalized).not.toBeNull()
    expect(normalized?.id).toBe(7)
    expect(normalized?.title).toBe('大理')
    expect(normalized?.publishedAt).toBe(iso(1))
    expect(normalized?.isLiked).toBe(false)
    expect(normalized?.author).toBeNull()
  })

  it('publishedAt 缺失/非法按 0 处理（排序时落到最旧）', () => {
    expect(feedPostTime({ publishedAt: null })).toBe(0)
    expect(feedPostTime({ publishedAt: 'not-a-date' })).toBe(0)
    expect(feedPostTime({ publishedAt: iso(2) })).toBeGreaterThan(0)
  })
})

describe('sortFeedCacheItems / mergeFeedCacheItems', () => {
  it('按 publishedAt 倒序，同时间按 id 倒序（排序稳定）', () => {
    const sorted = sortFeedCacheItems([post(1, iso(3)), post(2, iso(1)), post(3, iso(1))])
    expect(sorted.map((p) => p.id)).toEqual([3, 2, 1])
  })

  it('合并时同 id 以新数据覆盖（计数/点赞态取服务端最新），并重新排序', () => {
    const merged = mergeFeedCacheItems(
      [post(1, iso(5)), post(2, iso(4), { likeCount: 1 })],
      [post(2, iso(4), { likeCount: 99 }), post(3, iso(1))],
    )
    expect(merged.map((p) => p.id)).toEqual([3, 2, 1])
    expect(merged.find((p) => p.id === 2)?.likeCount).toBe(99)
  })
})

describe('trimFeedCacheItems（60 篇 / 3MB 双上限，先到为准）', () => {
  it('条数上限：70 篇 → 60 篇，保留 publishedAt 最新的那批', () => {
    const items = Array.from({ length: 70 }, (_, i) => post(i + 1, iso(i)))
    const trimmed = trimFeedCacheItems(items)
    expect(trimmed.items).toHaveLength(SOCIAL_FEED_CACHE_MAX_POSTS)
    expect(trimmed.dropped).toBe(10)
    expect(trimmed.items[0].id).toBe(1)
    expect(trimmed.items[trimmed.items.length - 1].id).toBe(60)
  })

  it('字节上限：撑爆 3MB 时从最旧端继续淘汰，直到落到上限内', () => {
    const big = 'x'.repeat(120 * 1024) // 每篇约 120KB 文本
    const items = Array.from({ length: 40 }, (_, i) => post(i + 1, iso(i), { summary: big }))
    const trimmed = trimFeedCacheItems(items)
    expect(trimmed.bytes).toBeLessThanOrEqual(SOCIAL_FEED_CACHE_MAX_BYTES)
    expect(trimmed.items.length).toBeLessThan(items.length)
    expect(trimmed.items.length).toBeGreaterThan(0)
    // 先到为准：条数没超，是字节触发的淘汰 —— 且保留的是最新的一端
    expect(trimmed.items[0].id).toBe(1)
    expect(measureFeedCacheBytes(trimmed.items)).toBe(trimmed.bytes)
  })

  it('空数组/极小输入不抛错', () => {
    const empty = trimFeedCacheItems([])
    expect(empty.items).toHaveLength(0)
    expect(empty.dropped).toBe(0)
    expect(trimFeedCacheItems([post(1, iso(0))]).items).toHaveLength(1)
  })
})

describe('parseFeedCacheSnapshot（schemaVersion / scope / items 三重校验）', () => {
  const valid = {
    scope: '1',
    schemaVersion: SOCIAL_FEED_CACHE_SCHEMA_VERSION,
    cachedAt: 123,
    total: 42,
    items: [post(1, iso(0)), post(2, iso(1))],
  }

  it('通过的快照会规整为「排序 + 收敛」后的结果', () => {
    const parsed = parseFeedCacheSnapshot(valid, '1')
    expect(parsed?.items.map((p) => p.id)).toEqual([1, 2])
    expect(parsed?.total).toBe(42)
  })

  it('schemaVersion 不符 → 整份作废（丢弃重拉）', () => {
    expect(parseFeedCacheSnapshot({ ...valid, schemaVersion: 999 }, '1')).toBeNull()
    expect(parseFeedCacheSnapshot({ ...valid, schemaVersion: undefined }, '1')).toBeNull()
  })

  it('账号作用域不符 → 整份作废（绝不串号）', () => {
    expect(parseFeedCacheSnapshot(valid, '2')).toBeNull()
  })

  it('任意一条 item 结构不符 → 整份作废（不做部分信任）', () => {
    expect(parseFeedCacheSnapshot({ ...valid, items: [post(1, iso(0)), { id: 'bad' }] }, '1')).toBeNull()
    expect(parseFeedCacheSnapshot({ ...valid, items: [] }, '1')).toBeNull()
  })
})
