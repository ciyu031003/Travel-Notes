/**
 * Redis 限流实现（多副本准备 · B）。
 *
 * 为什么需要：内存固定窗口在 N 个副本下等于把限额放大 N 倍（登录爆破、上传刷量都能绕过）。
 * 本实现把计数放到 Redis：
 *  · 固定窗口：`INCR` + 首次 `PEXPIRE`，窗口内所有副本共享同一个计数；
 *  · 登录失败锁定：`tn:rl:lock:<key>` 存 JSON {count, lockedUntil, lockMs}，指数退避语义与内存实现一致；
 *  · 所有命令 500ms 超时；Redis 不可用时**自动回退内存实现**并只告警一次。
 */
import {
  memoryRateLimiter,
  type LoginLockOptions,
  type LoginLockState,
  type RateLimitOptions,
  type RateLimitResult,
  type RateLimiter,
} from './rate-limit'
import { getRedisClient, logRedisDegradedOnce, withTimeout, REDIS_TIMEOUT_MS, type RedisClient } from './redis'

const PREFIX = 'tn:rl:'
const LOCK_PREFIX = 'tn:rl:lock:'

export type RedisClientProvider = () => Promise<RedisClient | null>

export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly getClient: RedisClientProvider = getRedisClient,
    private readonly fallback: RateLimiter = memoryRateLimiter,
  ) {}

  private async viaRedis<T>(op: (client: RedisClient) => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    let client: RedisClient | null = null
    try {
      client = await this.getClient()
    } catch (error) {
      logRedisDegradedOnce('获取客户端失败', error)
    }
    if (!client) return fallback()
    try {
      return await withTimeout(op(client), REDIS_TIMEOUT_MS)
    } catch (error) {
      logRedisDegradedOnce('限流命令失败', error)
      return fallback()
    }
  }

  async consume(options: RateLimitOptions): Promise<RateLimitResult> {
    return this.viaRedis(
      async (client) => {
        const key = PREFIX + options.prefix + ':' + options.key
        // INCR 返回自增后的值（1 = 窗口内第一次）
        const used = await client.incr(key)
        if (used === 1) {
          await client.pexpire(key, options.windowMs)
        }
        const ttl = await client.pttl(key)
        const ttlMs = ttl > 0 ? ttl : options.windowMs
        const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000))
        if (used > options.limit) {
          return { ok: false, used, remaining: 0, retryAfterSeconds }
        }
        return { ok: true, used, remaining: Math.max(0, options.limit - used), retryAfterSeconds }
      },
      () => this.fallback.consume(options),
    )
  }

  async checkLock(lockKey: string, _options: LoginLockOptions): Promise<LoginLockState> {
    return this.viaRedis<LoginLockState>(
      async (client) => {
        const raw = await client.get(LOCK_PREFIX + lockKey)
        if (!raw) return { locked: false, retryAfterSeconds: 0 }
        let entry: { count?: number; lockedUntil?: number } | null = null
        try {
          entry = JSON.parse(raw)
        } catch {
          entry = null
        }
        if (!entry || !entry.lockedUntil || entry.lockedUntil <= Date.now()) {
          return { locked: false, retryAfterSeconds: 0 }
        }
        return { locked: true, retryAfterSeconds: Math.ceil((entry.lockedUntil - Date.now()) / 1000) }
      },
      () => this.fallback.checkLock(lockKey, _options),
    )
  }

  async recordFailure(lockKey: string, options: LoginLockOptions): Promise<LoginLockState> {
    return this.viaRedis<LoginLockState>(
      async (client) => {
        const key = LOCK_PREFIX + lockKey
        const raw = await client.get(key)
        let prevCount = 0
        if (raw) {
          try {
            prevCount = Number(JSON.parse(raw)?.count) || 0
          } catch {
            prevCount = 0
          }
        }
        const count = prevCount + 1
        // 与内存实现一致的指数退避：base * 2^(n-1)，封顶 maxLockMs
        const lockMs = Math.min(options.baseLockMs * Math.pow(2, count - 1), options.maxLockMs)
        const entry = JSON.stringify({ count, lockedUntil: Date.now() + lockMs, lockMs })
        await client.setPx(key, entry, Math.max(lockMs, 1000))
        return { locked: true, retryAfterSeconds: Math.ceil(lockMs / 1000) }
      },
      () => this.fallback.recordFailure(lockKey, options),
    )
  }

  async clearFailures(lockKey: string): Promise<void> {
    await this.viaRedis<void>(
      async (client) => {
        await client.del([LOCK_PREFIX + lockKey])
      },
      () => this.fallback.clearFailures(lockKey),
    )
  }
}
