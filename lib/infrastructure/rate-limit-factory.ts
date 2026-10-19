/**
 * 限流器工厂（多副本准备 · B）。
 *
 * 选择规则：
 *  · 未配置 REDIS_URL → memoryRateLimiter（等价于现有同步 rateLimit()）；
 *  · 配置了 REDIS_URL → RedisRateLimiter（跨副本共享计数/失败锁定，失败自动回退内存）。
 *
 * 迁移说明（重要）：现有路由用的同步 `rateLimit()` / `checkLoginLock()` 仍是进程内实现
 * （保持默认行为不变）。多副本要真正共享限额，把调用点改为 `await rateLimitShared(...)`
 * 即可 —— 清单见 docs/ops/多副本部署.md。
 */
import {
  memoryRateLimiter,
  type LoginLockOptions,
  type LoginLockState,
  type RateLimitOptions,
  type RateLimitResult,
  type RateLimiter,
} from './rate-limit'
import { RedisRateLimiter } from './rate-limit-redis'
import { redisConfigured } from './redis'

let instance: RateLimiter | null = null

export function getRateLimiter(): RateLimiter {
  if (instance) return instance
  instance = redisConfigured() ? new RedisRateLimiter() : memoryRateLimiter
  return instance
}

/** 共享限流：未配置 REDIS_URL 时与同步 rateLimit() 完全一致 */
export async function rateLimitShared(options: RateLimitOptions): Promise<RateLimitResult> {
  return getRateLimiter().consume(options)
}

export async function checkLoginLockShared(
  lockKey: string,
  options: LoginLockOptions,
): Promise<LoginLockState> {
  return getRateLimiter().checkLock(lockKey, options)
}

export async function recordLoginFailureShared(
  lockKey: string,
  options: LoginLockOptions,
): Promise<LoginLockState> {
  return getRateLimiter().recordFailure(lockKey, options)
}

export async function clearLoginFailuresShared(lockKey: string): Promise<void> {
  return getRateLimiter().clearFailures(lockKey)
}

/** 测试用：重置单例 */
export function __resetRateLimiterForTest(): void {
  instance = null
}
