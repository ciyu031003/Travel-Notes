/**
 * Redis 缓存实现（多副本准备 · B）。
 *
 * 与 `MemoryCacheService` 同一 `CacheService` 接口，可被 container 无感替换：
 * 未配置 REDIS_URL 时永远不会实例化本类（见 cache-factory.ts）。
 *
 * 关键语义：
 *  · tag 失效跨副本共享：`tn:cache:tag:<tag>` 是 Set，保存带该 tag 的 key；
 *    `deleteByTag` 对 Set 里的 key 逐个 DEL，实现「一处写、全副本失效」；
 *  · 命令级 500ms 超时 + 失败降级内存（打一次告警），Redis 抖动不影响页面；
 *  · 清空前缀用 SCAN（生产禁用 KEYS）。
 */
import { memoryCacheService, type CacheService } from './cache'
import { getRedisClient, logRedisDegradedOnce, withTimeout, REDIS_TIMEOUT_MS, type RedisClient } from './redis'

const PREFIX = 'tn:cache:'
const TAG_PREFIX = 'tn:cache:tag:'

export type RedisClientProvider = () => Promise<RedisClient | null>

export class RedisCacheService implements CacheService {
  constructor(private readonly getClient: RedisClientProvider = getRedisClient) {}

  private cacheKey(key: string): string {
    return PREFIX + key
  }

  private tagKey(tag: string): string {
    return TAG_PREFIX + tag
  }

  /** 统一入口：Redis 可用则走 Redis，否则/失败则回退内存实现 */
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
      logRedisDegradedOnce('缓存命令失败', error)
      return fallback()
    }
  }

  async get<T>(key: string): Promise<T | null> {
    return this.viaRedis(
      async (client) => {
        const raw = await client.get(this.cacheKey(key))
        return raw == null ? null : (JSON.parse(raw) as T)
      },
      () => memoryCacheService.get<T>(key),
    )
  }

  async set<T>(key: string, value: T, ttlSeconds: number = 60, tags: string[] = []): Promise<void> {
    const ttlMs = Math.max(1, Math.round(ttlSeconds * 1000))
    const json = JSON.stringify(value)
    await this.viaRedis(
      async (client) => {
        await client.setPx(this.cacheKey(key), json, ttlMs)
        for (const tag of tags) {
          await client.sadd(this.tagKey(tag), [this.cacheKey(key)])
          // tag 集合比数据多留 60s，避免「数据还没过期、tag 索引先没了」导致失效漏 key
          await client.expireSeconds(this.tagKey(tag), Math.ceil(ttlMs / 1000) + 60)
        }
      },
      () => memoryCacheService.set(key, value, ttlSeconds, tags),
    )
  }

  async delete(key: string): Promise<void> {
    await this.viaRedis(
      async (client) => {
        await client.del([this.cacheKey(key)])
      },
      () => memoryCacheService.delete(key),
    )
  }

  async deleteByTag(tag: string): Promise<void> {
    await this.viaRedis(
      async (client) => {
        const tagKey = this.tagKey(tag)
        const keys = await client.smembers(tagKey)
        if (keys.length > 0) await client.del(keys)
        await client.del([tagKey])
      },
      () => memoryCacheService.deleteByTag(tag),
    )
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    await this.viaRedis(
      async (client) => {
        const keys = await client.scanPrefix(this.cacheKey(prefix))
        if (keys.length > 0) await client.del(keys)
      },
      () => memoryCacheService.deleteByPrefix(prefix),
    )
  }

  async clear(): Promise<void> {
    await this.viaRedis(
      async (client) => {
        const keys = await client.scanPrefix(PREFIX)
        if (keys.length > 0) await client.del(keys)
      },
      () => memoryCacheService.clear(),
    )
  }

  async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlSeconds?: number, tags?: string[]): Promise<T> {
    // 命中判定与回填都走 Redis；未命中时执行 fetcher（与内存实现语义一致，不做防击穿合并）
    const cached = await this.get<T>(key)
    if (cached != null) return cached
    const value = await fetcher()
    await this.set(key, value, ttlSeconds, tags)
    return value
  }
}
