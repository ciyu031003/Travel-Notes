interface CacheEntry<T> {
  value: T
  expireAt: number
  tags: Set<string>
}

class MemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map()
  private tagIndex: Map<string, Set<string>> = new Map()
  private maxSize: number
  private defaultTTL: number
  private hits = 0
  private misses = 0

  constructor(maxSize: number = 1000, defaultTTL: number = 60000) {
    this.maxSize = maxSize
    this.defaultTTL = defaultTTL
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) {
      this.misses++
      return null
    }
    if (Date.now() > entry.expireAt) {
      this.delete(key)
      this.misses++
      return null
    }
    this.hits++
    return entry.value as T
  }

  set<T>(key: string, value: T, ttl: number = this.defaultTTL, tags: string[] = []): void {
    if (this.cache.size >= this.maxSize) {
      this.evict()
    }

    const expireAt = Date.now() + ttl
    this.cache.set(key, { value, expireAt, tags: new Set(tags) })

    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set())
      }
      this.tagIndex.get(tag)!.add(key)
    }
  }

  getOrSet<T>(key: string, fetcher: () => Promise<T>, ttl?: number, tags?: string[]): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== null) {
      return Promise.resolve(cached)
    }
    return fetcher().then((value) => {
      this.set(key, value, ttl, tags)
      return value
    })
  }

  delete(key: string): void {
    const entry = this.cache.get(key)
    if (entry) {
      entry.tags.forEach(tag => {
        const keys = this.tagIndex.get(tag)
        if (keys) {
          keys.delete(key)
          if (keys.size === 0) {
            this.tagIndex.delete(tag)
          }
        }
      })
      this.cache.delete(key)
    }
  }

  deleteByTag(tag: string): void {
    const keys = this.tagIndex.get(tag)
    if (keys) {
      keys.forEach(key => {
        this.cache.delete(key)
      })
      this.tagIndex.delete(tag)
    }
  }

  clear(): void {
    this.cache.clear()
    this.tagIndex.clear()
    this.hits = 0
    this.misses = 0
  }

  clearByPrefix(prefix: string): void {
    const keysToDelete: string[] = []
    this.cache.forEach((_, key) => {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key)
      }
    })
    keysToDelete.forEach(key => {
      this.delete(key)
    })
  }

  getStats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total) * 100 : 0,
    }
  }

  private evict(): void {
    let oldestKey: string | null = null
    let oldestExpire = Infinity

    this.cache.forEach((entry, key) => {
      if (entry.expireAt < oldestExpire) {
        oldestExpire = entry.expireAt
        oldestKey = key
      }
    })

    if (oldestKey) {
      this.delete(oldestKey)
    } else {
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.delete(firstKey as string)
      }
    }
  }
}

export const appCache = new MemoryCache(2000, 60000)

const SITE_SETTINGS_CACHE_KEY = 'site:settings'
const SITE_SETTINGS_CACHE_TTL = 30000

export async function getCachedSiteSettings<T>(fetcher: () => Promise<T>): Promise<T> {
  return appCache.getOrSet(
    SITE_SETTINGS_CACHE_KEY,
    fetcher,
    SITE_SETTINGS_CACHE_TTL,
    ['settings']
  )
}

export function invalidateSiteSettingsCache(): void {
  appCache.deleteByTag('settings')
}

export function invalidatePostCacheByType(type: string): void {
  appCache.deleteByTag(`posts:${type}`)
}

export function invalidateAllPostCache(): void {
  const tagIndex = appCache['tagIndex'] as Map<string, Set<string>>
  tagIndex.forEach((_, tag) => {
    if (tag.startsWith('posts:')) {
      appCache.deleteByTag(tag)
    }
  })
}

export function getCacheStats(): { size: number; hits: number; misses: number; hitRate: number } {
  return appCache.getStats()
}
