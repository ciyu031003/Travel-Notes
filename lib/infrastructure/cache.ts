import { appCache } from '../cache'

export interface CacheService {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlSeconds?: number, tags?: string[]): Promise<void>
  delete(key: string): Promise<void>
  deleteByTag(tag: string): Promise<void>
  deleteByPrefix(prefix: string): Promise<void>
  clear(): Promise<void>
  getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlSeconds?: number, tags?: string[]): Promise<T>
}

export class MemoryCacheService implements CacheService {
  async get<T>(key: string): Promise<T | null> {
    return appCache.get<T>(key)
  }

  async set<T>(key: string, value: T, ttlSeconds: number = 60, tags: string[] = []): Promise<void> {
    appCache.set(key, value, ttlSeconds * 1000, tags)
  }

  async delete(key: string): Promise<void> {
    appCache.delete(key)
  }

  async deleteByTag(tag: string): Promise<void> {
    appCache.deleteByTag(tag)
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    appCache.clearByPrefix(prefix)
  }

  async clear(): Promise<void> {
    appCache.clear()
  }

  async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlSeconds?: number, tags?: string[]): Promise<T> {
    return appCache.getOrSet(key, fetcher, ttlSeconds ? ttlSeconds * 1000 : undefined, tags)
  }
}

export const memoryCacheService = new MemoryCacheService()
