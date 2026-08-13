/**
 * 轻量内存 Rate Limiter（固定窗口计数）。
 * 适用于小型单体：单实例内存即可，无需 Redis。
 * 多个限制维度可用不同 prefix 组合（IP / 用户名 / 邮箱 / 全局）。
 */

export interface RateLimitOptions {
  /** 限制键前缀，如 "login:ip"、"login:user" */
  prefix: string
  /** 限制键（IP / 用户名 / 邮箱等） */
  key: string
  /** 窗口内允许的最大次数 */
  limit: number
  /** 窗口长度（毫秒） */
  windowMs: number
}

export interface RateLimitResult {
  ok: boolean
  /** 当前窗口已用次数 */
  used: number
  /** 剩余可放行次数 */
  remaining: number
  /** 需要等待的秒数（被限流时） */
  retryAfterSeconds: number
}

interface WindowEntry {
  count: number
  resetAt: number
}

const windows = new Map<string, WindowEntry>()

function bucketKey(prefix: string, key: string): string {
  return `${prefix}:${key}`
}

/** 清理过期窗口，防止内存膨胀 */
function sweep(): void {
  const now = Date.now()
  if (windows.size > 5000) {
    windows.forEach((v, k) => {
      if (v.resetAt < now) windows.delete(k)
    })
  }
}

export function rateLimit(options: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const key = bucketKey(options.prefix, options.key)
  sweep()

  let entry = windows.get(key)
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + options.windowMs }
    windows.set(key, entry)
  }

  const used = entry.count
  const remaining = Math.max(0, options.limit - used)
  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000))

  if (used >= options.limit) {
    return { ok: false, used, remaining: 0, retryAfterSeconds }
  }

  entry.count += 1
  return { ok: true, used: used + 1, remaining: Math.max(0, options.limit - used - 1), retryAfterSeconds }
}

/**
 * 登录失败锁定：连续失败达到阈值后，对 (IP, 用户名) 组合锁定一段时间。
 * 锁定期间直接拒绝，并返回剩余等待时间（指数退避的简单实现）。
 */
export interface LoginLockOptions {
  /** 连续失败多少次后锁定 */
  maxFailures: number
  /** 首次锁定毫秒数 */
  baseLockMs: number
  /** 最大锁定毫秒数 */
  maxLockMs: number
}

const failures = new Map<string, { count: number; lockedUntil: number; lockMs: number }>()

export function checkLoginLock(lockKey: string, options: LoginLockOptions): { locked: boolean; retryAfterSeconds: number } {
  const now = Date.now()
  const entry = failures.get(lockKey)
  if (!entry || entry.lockedUntil <= now) {
    return { locked: false, retryAfterSeconds: 0 }
  }
  return { locked: true, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) }
}

export function recordLoginFailure(lockKey: string, options: LoginLockOptions): { locked: boolean; retryAfterSeconds: number } {
  const now = Date.now()
  const prev = failures.get(lockKey)
  const count = (prev ? prev.count : 0) + 1
  const lockMs = Math.min(options.baseLockMs * Math.pow(2, count - 1), options.maxLockMs)

  const entry = {
    count,
    lockedUntil: now + lockMs,
    lockMs,
  }
  failures.set(lockKey, entry)
  return { locked: true, retryAfterSeconds: Math.ceil(lockMs / 1000) }
}

export function clearLoginFailures(lockKey: string): void {
  failures.delete(lockKey)
}
