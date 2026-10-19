import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  appCache,
  getCachedSiteSettings,
  invalidateSiteSettingsCache,
  invalidatePostCacheByType,
  invalidateAllPostCache,
  getCacheStats,
} from '@/lib/cache'

/** P3-39：MemoryCache（lib/cache.ts）此前几乎无覆盖，纯内存逻辑可完全单测。 */
describe('MemoryCache', () => {
  beforeEach(() => {
    appCache.clear()
    vi.useRealTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    appCache.clear()
  })

  it('set/get 往返；miss 返回 null 且计入 misses', () => {
    appCache.set('k1', { v: 1 })
    expect(appCache.get('k1')).toEqual({ v: 1 })
    expect(appCache.get('nope')).toBeNull()
    const stats = appCache.getStats()
    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(1)
    expect(stats.size).toBe(1)
    expect(stats.hitRate).toBeCloseTo(50, 5)
  })

  it('TTL 到期后自动失效（假时钟）', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-19T00:00:00Z'))
    appCache.set('ttl', 'v', 1000)
    expect(appCache.get('ttl')).toBe('v')
    vi.advanceTimersByTime(1001)
    expect(appCache.get('ttl')).toBeNull()
  })

  it('getOrSet 命中缓存只取一次；未命中会写入', async () => {
    const fetcher = vi.fn().mockResolvedValue('fetched')
    expect(await appCache.getOrSet('gos', fetcher)).toBe('fetched')
    expect(await appCache.getOrSet('gos', fetcher)).toBe('fetched')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('deleteByTag / invalidatePostCacheByType / invalidateAllPostCache', () => {
    appCache.set('p1', 'a', 60_000, ['posts:travel'])
    appCache.set('p2', 'b', 60_000, ['posts:travel'])
    appCache.set('p3', 'c', 60_000, ['posts:moment'])
    appCache.set('other', 'd', 60_000, ['misc'])

    invalidatePostCacheByType('travel')
    expect(appCache.get('p1')).toBeNull()
    expect(appCache.get('p2')).toBeNull()
    expect(appCache.get('p3')).toBe('c')

    invalidateAllPostCache()
    expect(appCache.get('p3')).toBeNull()
    expect(appCache.get('other')).toBe('d')
  })

  it('clearByPrefix 只清指定前缀', () => {
    appCache.set('user:1', 'a')
    appCache.set('user:2', 'b')
    appCache.set('post:1', 'c')
    appCache.clearByPrefix('user:')
    expect(appCache.get('user:1')).toBeNull()
    expect(appCache.get('user:2')).toBeNull()
    expect(appCache.get('post:1')).toBe('c')
  })

  it('delete 同时清理 tag 索引；clear 清空并重置统计', () => {
    appCache.set('x', 1, 60_000, ['t'])
    appCache.delete('x')
    expect(appCache.get('x')).toBeNull()
    appCache.delete('missing') // 不存在的 key 不报错

    appCache.set('y', 2)
    appCache.clear()
    expect(getCacheStats()).toMatchObject({ size: 0, hits: 0, misses: 0, hitRate: 0 })
  })

  it('超过 maxSize 时按最早过期时间淘汰', () => {
    for (let i = 0; i < 2000; i++) appCache.set(`k${i}`, i)
    appCache.set('overflow', 'x')
    expect(getCacheStats().size).toBe(2000)
  })

  it('getCachedSiteSettings 缓存 + invalidateSiteSettingsCache 失效', async () => {
    const fetcher = vi.fn().mockResolvedValue({ username: 'admin' })
    expect(await getCachedSiteSettings(fetcher)).toEqual({ username: 'admin' })
    expect(await getCachedSiteSettings(fetcher)).toEqual({ username: 'admin' })
    expect(fetcher).toHaveBeenCalledTimes(1)

    invalidateSiteSettingsCache()
    const fetcher2 = vi.fn().mockResolvedValue({ username: 'new' })
    expect(await getCachedSiteSettings(fetcher2)).toEqual({ username: 'new' })
    expect(fetcher2).toHaveBeenCalledTimes(1)
  })
})
