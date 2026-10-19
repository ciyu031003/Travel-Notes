/**
 * 缓存服务工厂（多副本准备 · B）。
 *
 * 选择规则（保持零影响）：
 *  · 未配置 REDIS_URL → 返回**同一个** MemoryCacheService 实例（与改造前完全一致）；
 *  · 配置了 REDIS_URL → 返回 RedisCacheService（命令失败/超时自动回退内存并告警一次）。
 *
 * 单独成文件是为了避免 cache.ts ↔ cache-redis.ts 的循环依赖。
 */
import { memoryCacheService, type CacheService } from './cache'
import { RedisCacheService } from './cache-redis'
import { redisConfigured } from './redis'

let instance: CacheService | null = null

export function getCacheService(): CacheService {
  if (instance) return instance
  instance = redisConfigured() ? new RedisCacheService() : memoryCacheService
  return instance
}

/** 测试用：重置单例（配合环境变量切换） */
export function __resetCacheServiceForTest(): void {
  instance = null
}
