import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RedisRateLimiter } from '@/lib/infrastructure/rate-limit-redis'
import { memoryRateLimiter } from '@/lib/infrastructure/rate-limit'
import { __resetRedisForTest } from '@/lib/infrastructure/redis'
import { createFakeRedis } from '../helpers/fake-redis'

/**
 * 多副本准备 · B：Redis 限流实现单测（fake client）。
 * 覆盖：窗口计数 / 超限 / 窗口过期重置 / 失败退避锁 / 清锁 / 不可用时降级内存。
 */

const LOCK_OPTS = { maxFailures: 5, baseLockMs: 60_000, maxLockMs: 30 * 60_000 }
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  __resetRedisForTest()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => warnSpy.mockRestore())

describe('RedisRateLimiter.consume', () => {
  it('同一窗口内累计计数，超过 limit 后拒绝并给出 retryAfterSeconds', async () => {
    const fake = createFakeRedis()
    const limiter = new RedisRateLimiter(async () => fake)
    const opts = { prefix: 'login:ip', key: '1.2.3.4', limit: 2, windowMs: 60_000 }

    const first = await limiter.consume(opts)
    expect(first).toMatchObject({ ok: true, used: 1, remaining: 1 })
    expect(first.retryAfterSeconds).toBe(60)

    const second = await limiter.consume(opts)
    expect(second).toMatchObject({ ok: true, used: 2, remaining: 0 })

    const third = await limiter.consume(opts)
    expect(third.ok).toBe(false)
    expect(third.remaining).toBe(0)
    expect(third.used).toBe(3)
    expect(third.retryAfterSeconds).toBeGreaterThan(0)
    expect(fake.calls.some((c) => c.cmd === 'incr' && String(c.args[0]).startsWith('tn:rl:'))).toBe(true)
  })

  it('窗口过期后计数重置（新窗口从 1 开始）', async () => {
    const fake = createFakeRedis()
    const limiter = new RedisRateLimiter(async () => fake)
    const opts = { prefix: 'upload:ip', key: 'ip', limit: 1, windowMs: 60_000 }

    expect((await limiter.consume(opts)).ok).toBe(true)
    expect((await limiter.consume(opts)).ok).toBe(false)

    fake.advance(60_001)
    const afterWindow = await limiter.consume(opts)
    expect(afterWindow.ok).toBe(true)
    expect(afterWindow.used).toBe(1)
  })

  it('不同 key 各自独立计数（不会串桶）', async () => {
    const fake = createFakeRedis()
    const limiter = new RedisRateLimiter(async () => fake)
    const a = { prefix: 'login:ip', key: 'a', limit: 1, windowMs: 60_000 }
    const b = { prefix: 'login:ip', key: 'b', limit: 1, windowMs: 60_000 }
    expect((await limiter.consume(a)).ok).toBe(true)
    expect((await limiter.consume(b)).ok).toBe(true)
    expect((await limiter.consume(a)).ok).toBe(false)
  })
})

describe('RedisRateLimiter 失败锁定', () => {
  it('recordFailure 写入指数退避锁，checkLock 能读到，clearFailures 解除', async () => {
    const fake = createFakeRedis()
    const limiter = new RedisRateLimiter(async () => fake)
    const key = 'login:ip:1.2.3.4:alice'

    expect(await limiter.checkLock(key, LOCK_OPTS)).toEqual({ locked: false, retryAfterSeconds: 0 })

    const first = await limiter.recordFailure(key, LOCK_OPTS)
    expect(first.locked).toBe(true)
    expect(first.retryAfterSeconds).toBe(60)

    const locked = await limiter.checkLock(key, LOCK_OPTS)
    expect(locked.locked).toBe(true)
    expect(locked.retryAfterSeconds).toBeGreaterThan(0)

    await limiter.clearFailures(key)
    expect(await limiter.checkLock(key, LOCK_OPTS)).toEqual({ locked: false, retryAfterSeconds: 0 })
  })

  it('连续失败按 2 的幂退避（第二次锁定时长翻倍）', async () => {
    const fake = createFakeRedis()
    const limiter = new RedisRateLimiter(async () => fake)
    const key = 'lock:exp'

    const first = await limiter.recordFailure(key, LOCK_OPTS)
    const second = await limiter.recordFailure(key, LOCK_OPTS)
    expect(second.retryAfterSeconds).toBe(first.retryAfterSeconds * 2)
  })

  it('锁定到期后自动解锁', async () => {
    const fake = createFakeRedis()
    const limiter = new RedisRateLimiter(async () => fake)
    const key = 'lock:expire'
    await limiter.recordFailure(key, LOCK_OPTS)
    fake.advance(61_000)
    expect(await limiter.checkLock(key, LOCK_OPTS)).toEqual({ locked: false, retryAfterSeconds: 0 })
  })
})

describe('降级（Redis 不可用）', () => {
  it('拿不到客户端 → 回退内存实现，功能不失败', async () => {
    const limiter = new RedisRateLimiter(async () => null)
    const opts = { prefix: 'fallback:mem', key: 'k', limit: 1, windowMs: 60_000 }
    expect((await limiter.consume(opts)).ok).toBe(true)
    expect((await limiter.consume(opts)).ok).toBe(false)

    const lockKey = 'fallback:mem:lock'
    await limiter.recordFailure(lockKey, LOCK_OPTS)
    expect((await limiter.checkLock(lockKey, LOCK_OPTS)).locked).toBe(true)
    await limiter.clearFailures(lockKey)
    expect((await limiter.checkLock(lockKey, LOCK_OPTS)).locked).toBe(false)
  })

  it('Redis 命令异常 → 回退内存且告警只打一次', async () => {
    const fake = createFakeRedis()
    fake.incr = async () => {
      throw new Error('redis down')
    }
    const limiter = new RedisRateLimiter(async () => fake)
    const opts = { prefix: 'fallback:err', key: 'k', limit: 5, windowMs: 60_000 }

    expect((await limiter.consume(opts)).ok).toBe(true)
    expect((await limiter.consume(opts)).ok).toBe(true)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    // 两次都降级到内存实现：同 key 继续累加 → 内存里已是第 3 次
    const mem = await memoryRateLimiter.consume({ prefix: 'fallback:err', key: 'k', limit: 5, windowMs: 60_000 })
    expect(mem.used).toBe(3)
  })
})
