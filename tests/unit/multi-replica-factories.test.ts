import { describe, it, expect, beforeEach } from 'vitest'
import os from 'os'
import path from 'path'
import { getCacheService, __resetCacheServiceForTest } from '@/lib/infrastructure/cache-factory'
import { memoryCacheService } from '@/lib/infrastructure/cache'
import { RedisCacheService } from '@/lib/infrastructure/cache-redis'
import { getRateLimiter, __resetRateLimiterForTest } from '@/lib/infrastructure/rate-limit-factory'
import { memoryRateLimiter } from '@/lib/infrastructure/rate-limit'
import { RedisRateLimiter } from '@/lib/infrastructure/rate-limit-redis'
import { __resetRedisForTest } from '@/lib/infrastructure/redis'
import { mediaTmpBaseDir, mediaTmpDir } from '@/lib/media/tmp-dir'

/**
 * 多副本准备 · B：默认行为零影响 + 媒体临时目录可配。
 *  · 未配置 REDIS_URL → 缓存/限流仍是原来的内存单例（一行行为都不变）；
 *  · 配置 REDIS_URL → 切 Redis 实现（构造不连接，真正用时才连）；
 *  · MEDIA_TMP_DIR 未配置 → os.tmpdir()，配置 → 用它（多副本共享卷）。
 */

function withEnv(name: string, value: string | undefined): () => void {
  const prev = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  return () => {
    if (prev === undefined) delete process.env[name]
    else process.env[name] = prev
  }
}

beforeEach(() => {
  __resetCacheServiceForTest()
  __resetRateLimiterForTest()
  __resetRedisForTest()
})

describe('缓存/限流工厂：未配置 REDIS_URL 时行为完全不变', () => {
  it('缓存返回原来的内存单例', () => {
    const restore = withEnv('REDIS_URL', undefined)
    try {
      expect(getCacheService()).toBe(memoryCacheService)
    } finally {
      restore()
    }
  })

  it('限流返回原来的内存实现', () => {
    const restore = withEnv('REDIS_URL', undefined)
    try {
      expect(getRateLimiter()).toBe(memoryRateLimiter)
    } finally {
      restore()
    }
  })

  it('空字符串/空白 REDIS_URL 也按未配置处理（不会误连）', () => {
    const restore = withEnv('REDIS_URL', '   ')
    try {
      expect(getCacheService()).toBe(memoryCacheService)
      expect(getRateLimiter()).toBe(memoryRateLimiter)
    } finally {
      restore()
    }
  })
})

describe('rateLimitShared 未配 REDIS_URL 时与同步语义一致（迁移不改行为）', () => {
  it('同一窗口内 limit 次数放行，第 limit+1 次拒绝并给 retryAfterSeconds', async () => {
    const { rateLimitShared } = await import('@/lib/infrastructure/rate-limit-factory')
    const restore = withEnv('REDIS_URL', undefined)
    try {
      __resetRateLimiterForTest()
      const opts = { prefix: 'migrate:parity', key: 'k', limit: 2, windowMs: 60_000 }
      const first = await rateLimitShared(opts)
      expect(first).toMatchObject({ ok: true, used: 1, remaining: 1 })
      const second = await rateLimitShared(opts)
      expect(second).toMatchObject({ ok: true, used: 2, remaining: 0 })
      const third = await rateLimitShared(opts)
      expect(third.ok).toBe(false)
      expect(third.retryAfterSeconds).toBeGreaterThan(0)
    } finally {
      restore()
    }
  })
})

describe('缓存/限流工厂：配置 REDIS_URL 后切换实现', () => {
  it('缓存切到 RedisCacheService（构造不连接，失败时命令级降级）', () => {
    const restore = withEnv('REDIS_URL', 'redis://127.0.0.1:6379')
    try {
      __resetCacheServiceForTest()
      expect(getCacheService()).toBeInstanceOf(RedisCacheService)
    } finally {
      restore()
    }
  })

  it('限流切到 RedisRateLimiter', () => {
    const restore = withEnv('REDIS_URL', 'redis://127.0.0.1:6379')
    try {
      __resetRateLimiterForTest()
      expect(getRateLimiter()).toBeInstanceOf(RedisRateLimiter)
    } finally {
      restore()
    }
  })
})

describe('媒体临时目录（MEDIA_TMP_DIR）', () => {
  it('未配置 → os.tmpdir()', () => {
    const restore = withEnv('MEDIA_TMP_DIR', undefined)
    try {
      expect(mediaTmpBaseDir()).toBe(os.tmpdir())
      expect(mediaTmpDir('tn-iuploads')).toBe(path.join(os.tmpdir(), 'tn-iuploads'))
    } finally {
      restore()
    }
  })

  it('配置后使用它（忽略首尾空白），子目录拼接正确', () => {
    const restore = withEnv('MEDIA_TMP_DIR', '  /data/travel-notes/media-tmp  ')
    try {
      expect(mediaTmpBaseDir()).toBe('/data/travel-notes/media-tmp')
      expect(mediaTmpDir('tn-iuploads')).toBe(path.join('/data/travel-notes/media-tmp', 'tn-iuploads'))
    } finally {
      restore()
    }
  })

  it('空白配置回退 os.tmpdir()（避免拼出相对路径）', () => {
    const restore = withEnv('MEDIA_TMP_DIR', '   ')
    try {
      expect(mediaTmpBaseDir()).toBe(os.tmpdir())
    } finally {
      restore()
    }
  })
})
