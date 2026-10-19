/**
 * Redis 客户端（多副本准备 · B）。
 *
 * 定位：**可选**共享状态后端。未配置 REDIS_URL 时所有调用方都走纯内存实现，
 * 行为与改造前完全一致；配置后限流与缓存跨副本共享。
 *
 * 三条硬约束（评审 /api/health 与多副本清单的落地要求）：
 *  1) 连接必须快失败：connectTimeout=500ms + ping 探活，失败立即降级内存而不是把请求挂住；
 *  2) 降级只打**一次**告警日志（avoid 每请求刷屏），并在 60s 冷却期内不再重试连接；
 *  3) 绝不因 Redis 不可用而让业务失败：调用方拿到 null 后自行回退内存。
 */

/** 连接/命令超时（评审要求 500ms） */
export const REDIS_TIMEOUT_MS = 500

/** 连接失败后的冷却期：这段时间内直接按「不可用」处理，避免每个请求都尝试重连 */
const RECONNECT_COOLDOWN_MS = 60_000

/**
 * 对外暴露的最小命令集合：只保留缓存/限流真正用到的命令。
 * 这样单测可以用一个 Map 实现 fake client，不需要跑真的 Redis。
 */
export interface RedisClient {
  get(key: string): Promise<string | null>
  setPx(key: string, value: string, ttlMs: number): Promise<void>
  del(keys: string[]): Promise<number>
  sadd(key: string, members: string[]): Promise<number>
  smembers(key: string): Promise<string[]>
  expireSeconds(key: string, seconds: number): Promise<number>
  incr(key: string): Promise<number>
  pexpire(key: string, ms: number): Promise<number>
  pttl(key: string): Promise<number>
  /** 用 SCAN 按前缀收集 key（生产禁用 KEYS） */
  scanPrefix(prefix: string): Promise<string[]>
  ping(): Promise<void>
}

/** ioredis 实例的最小形状（v5/v6 都兼容；用结构类型避免被版本类型细节绊住） */
interface IoredisLike {
  connect(): Promise<void>
  ping(): Promise<string>
  get(key: string): Promise<string | null>
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>
  del(...keys: string[]): Promise<number>
  sadd(key: string, ...members: string[]): Promise<number>
  smembers(key: string): Promise<string[]>
  expire(key: string, seconds: number): Promise<number>
  incr(key: string): Promise<number>
  pexpire(key: string, ms: number): Promise<number>
  pttl(key: string): Promise<number>
  scan(cursor: string, ...args: (string | number)[]): Promise<[string, string[]]>
  on(event: 'error', listener: (error: Error) => void): unknown
  quit(): Promise<unknown>
  disconnect(): void
}

class IoredisAdapter implements RedisClient {
  constructor(private readonly redis: IoredisLike) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key)
  }

  async setPx(key: string, value: string, ttlMs: number): Promise<void> {
    await this.redis.set(key, value, 'PX', Math.max(1, ttlMs))
  }

  async del(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0
    return this.redis.del(...keys)
  }

  async sadd(key: string, members: string[]): Promise<number> {
    if (members.length === 0) return 0
    return this.redis.sadd(key, ...members)
  }

  async smembers(key: string): Promise<string[]> {
    return this.redis.smembers(key)
  }

  async expireSeconds(key: string, seconds: number): Promise<number> {
    return this.redis.expire(key, Math.max(1, Math.ceil(seconds)))
  }

  async incr(key: string): Promise<number> {
    return this.redis.incr(key)
  }

  async pexpire(key: string, ms: number): Promise<number> {
    return this.redis.pexpire(key, Math.max(1, Math.ceil(ms)))
  }

  async pttl(key: string): Promise<number> {
    return this.redis.pttl(key)
  }

  async scanPrefix(prefix: string): Promise<string[]> {
    const found: string[] = []
    let cursor = '0'
    // 上限保护：前缀扫描最多 20 轮（COUNT 500），避免异常数据把请求拖死
    for (let round = 0; round < 20; round++) {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', prefix + '*', 'COUNT', 500)
      found.push(...keys)
      cursor = next
      if (cursor === '0') break
    }
    return found
  }

  async ping(): Promise<void> {
    await this.redis.ping()
  }
}

let client: RedisClient | null = null
let lastFailureAt = 0
let degradedLogged = false
/** 测试注入点：返回 null 表示「Redis 不可用」，返回 fake 表示「可用」 */
let testProvider: (() => Promise<RedisClient | null>) | null = null

/** 配置了 REDIS_URL 才启用共享后端 */
export function redisUrl(): string | null {
  const url = (process.env.REDIS_URL || '').trim()
  return url || null
}

export function redisConfigured(): boolean {
  return redisUrl() !== null
}

/** 降级告警只打一次（一次故障 = 一条日志，不刷屏） */
export function logRedisDegradedOnce(context: string, error?: unknown): void {
  if (degradedLogged) return
  degradedLogged = true
  const detail = error instanceof Error ? error.message : error ? String(error) : ''
  console.warn('[redis] 共享后端不可用，已降级为进程内存实现（Redis 恢复后需重启或等冷却期重连）:', context, detail)
}

/** 给 Promise 加超时（Redis 卡住时不能把请求挂死） */
export function withTimeout<T>(promise: Promise<T>, ms: number = REDIS_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('redis timeout ' + ms + 'ms')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function connectIoredis(url: string): Promise<RedisClient> {
  const mod: any = await import('ioredis')
  const RedisCtor = mod?.default ?? mod?.Redis ?? mod
  const redis: IoredisLike = new RedisCtor(url, {
    lazyConnect: true,
    connectTimeout: REDIS_TIMEOUT_MS,
    // 单command 最多重试 1 次：健康检查/限流不能被重试拖长
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 200, 1000)),
  })
  redis.on('error', (error) => logRedisDegradedOnce('连接异常', error))
  await withTimeout(redis.connect())
  await withTimeout(redis.ping())
  return new IoredisAdapter(redis)
}

/**
 * 取共享 Redis 客户端；未配置 / 连接失败 / 冷却期内一律返回 null（调用方回退内存）。
 * 连接被缓存：成功的连接在进程生命周期内复用。
 */
export async function getRedisClient(): Promise<RedisClient | null> {
  if (testProvider) return testProvider()
  const url = redisUrl()
  if (!url) return null
  if (client) return client
  if (Date.now() - lastFailureAt < RECONNECT_COOLDOWN_MS) return null
  try {
    client = await connectIoredis(url)
    return client
  } catch (error) {
    lastFailureAt = Date.now()
    logRedisDegradedOnce('连接失败', error)
    return null
  }
}

/** 测试用：注入 provider（null 恢复真实连接） */
export function __setRedisClientProviderForTest(provider: (() => Promise<RedisClient | null>) | null): void {
  testProvider = provider
  client = null
  lastFailureAt = 0
  degradedLogged = false
}

/** 测试用：重置模块状态 */
export function __resetRedisForTest(): void {
  try {
    client = null
    lastFailureAt = 0
    degradedLogged = false
    testProvider = null
  } catch {
    // ignore
  }
}
