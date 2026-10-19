import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RedisCacheService } from '@/lib/infrastructure/cache-redis'
import { memoryCacheService } from '@/lib/infrastructure/cache'
import { __resetRedisForTest } from '@/lib/infrastructure/redis'
import { createFakeRedis } from '../helpers/fake-redis'

/**
 * 多副本准备 · B：Redis 缓存实现单测（fake client，不依赖真实 Redis）。
 * 覆盖：命中 / TTL 过期 / tag 失效 / 前缀清理 / clear / getOrSet / 不可用时降级内存。
 */

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  __resetRedisForTest()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe('RedisCacheService', () => {
  it('set → get 命中（JSON 往返），且带 TTL 写到底层', async () => {
    const fake = createFakeRedis()
    const cache = new RedisCacheService(async () => fake)

    await cache.set('site:config', { username: 'admin' }, 60, ['site'])
    expect(await cache.get('site:config')).toEqual({ username: 'admin' })

    const setCall = fake.calls.find((c) => c.cmd === 'setPx')
    expect(setCall?.args[0]).toBe('tn:cache:site:config')
    expect(setCall?.args[2]).toBe(60_000)
  })

  it('TTL 过期后 get 返回 null（不返回旧值）', async () => {
    const fake = createFakeRedis()
    const cache = new RedisCacheService(async () => fake)
    await cache.set('k', 'v', 10)
    expect(await cache.get('k')).toBe('v')
    fake.advance(10_001)
    expect(await cache.get('k')).toBeNull()
  })

  it('deleteByTag 跨 key 失效（多副本共享 tag 索引的关键语义）', async () => {
    const fake = createFakeRedis()
    const cache = new RedisCacheService(async () => fake)
    await cache.set('site:a', 1, 60, ['site'])
    await cache.set('site:b', 2, 60, ['site'])
    await cache.set('other', 3, 60, ['other'])

    await cache.deleteByTag('site')

    expect(await cache.get('site:a')).toBeNull()
    expect(await cache.get('site:b')).toBeNull()
    expect(await cache.get('other')).toBe(3)
    expect(fake.sets.has('tn:cache:tag:site')).toBe(false)
  })

  it('deleteByPrefix 只清匹配前缀的 key', async () => {
    const fake = createFakeRedis()
    const cache = new RedisCacheService(async () => fake)
    await cache.set('posts:1', 'a')
    await cache.set('posts:2', 'b')
    await cache.set('home:1', 'c')

    await cache.deleteByPrefix('posts:')

    expect(await cache.get('posts:1')).toBeNull()
    expect(await cache.get('posts:2')).toBeNull()
    expect(await cache.get('home:1')).toBe('c')
  })

  it('clear 清空所有带命名空间的 key', async () => {
    const fake = createFakeRedis()
    const cache = new RedisCacheService(async () => fake)
    await cache.set('a', 1)
    await cache.set('b', 2)
    await cache.clear()
    expect(await cache.get('a')).toBeNull()
    expect(await cache.get('b')).toBeNull()
  })

  it('getOrSet：未命中执行一次 fetcher 并回填，命中后不再执行', async () => {
    const fake = createFakeRedis()
    const cache = new RedisCacheService(async () => fake)
    const fetcher = vi.fn(async () => ({ n: 1 }))

    expect(await cache.getOrSet('g', fetcher, 30)).toEqual({ n: 1 })
    expect(await cache.getOrSet('g', fetcher, 30)).toEqual({ n: 1 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('未配置/拿不到客户端 → 自动降级内存实现（业务不失败）', async () => {
    const cache = new RedisCacheService(async () => null)
    await cache.set('fallback:k', 'v', 30)
    // 落到了内存实现
    expect(await memoryCacheService.get('fallback:k')).toBe('v')
    expect(await cache.get('fallback:k')).toBe('v')
  })

  it('Redis 命令失败 → 降级内存并且告警只打一次', async () => {
    const fake = createFakeRedis()
    fake.get = async () => {
      throw new Error('redis boom')
    }
    const cache = new RedisCacheService(async () => fake)

    expect(await cache.get('boom:1')).toBeNull()
    expect(await cache.get('boom:2')).toBeNull()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})
