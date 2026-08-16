import { describe, it, expect, beforeEach } from 'vitest'
import { rateLimit, checkLoginLock, recordLoginFailure, clearLoginFailures } from '@/lib/infrastructure/rate-limit'

describe('rateLimit（固定窗口）', () => {
  const opts = { prefix: 'test:rl', key: 'k1', limit: 3, windowMs: 60_000 }

  it('窗口内允许 limit 次，之后拒绝', () => {
    expect(rateLimit(opts).ok).toBe(true)
    expect(rateLimit(opts).ok).toBe(true)
    expect(rateLimit(opts).ok).toBe(true)
    const fourth = rateLimit(opts)
    expect(fourth.ok).toBe(false)
    expect(fourth.remaining).toBe(0)
    expect(fourth.retryAfterSeconds).toBeGreaterThanOrEqual(1)
  })

  it('不同 key 相互独立', () => {
    expect(rateLimit({ ...opts, key: 'a' }).ok).toBe(true)
    expect(rateLimit({ ...opts, key: 'a' }).ok).toBe(true)
    expect(rateLimit({ ...opts, key: 'b' }).ok).toBe(true)
    expect(rateLimit({ ...opts, key: 'b' }).ok).toBe(true)
  })
})

describe('登录失败锁定（指数退避）', () => {
  beforeEach(() => clearLoginFailures('test:lock:u1'))

  it('首次失败即锁定 baseLockMs', () => {
    const cfg = { maxFailures: 1, baseLockMs: 1000, maxLockMs: 64000 }
    const r = recordLoginFailure('test:lock:u1', cfg)
    expect(r.locked).toBe(true)
    expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1)
    expect(checkLoginLock('test:lock:u1', cfg).locked).toBe(true)
  })

  it('连续失败退避时间递增', () => {
    const cfg = { maxFailures: 1, baseLockMs: 1000, maxLockMs: 64000 }
    recordLoginFailure('test:lock:u2', cfg)
    recordLoginFailure('test:lock:u2', cfg)
    recordLoginFailure('test:lock:u2', cfg)
    const r4 = recordLoginFailure('test:lock:u2', cfg)
    const r1 = recordLoginFailure('test:lock:u3', cfg)
    expect(r4.retryAfterSeconds).toBeGreaterThanOrEqual(r1.retryAfterSeconds)
  })

  it('clearLoginFailures 解除锁定', () => {
    const cfg = { maxFailures: 1, baseLockMs: 60_000, maxLockMs: 60_000 }
    recordLoginFailure('test:lock:u4', cfg)
    clearLoginFailures('test:lock:u4')
    expect(checkLoginLock('test:lock:u4', cfg).locked).toBe(false)
  })
})
