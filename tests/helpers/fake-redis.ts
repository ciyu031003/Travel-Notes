import type { RedisClient } from '@/lib/infrastructure/redis'

/**
 * 内存版 fake Redis（多副本单测用）：只实现 `RedisClient` 里被缓存/限流用到的命令。
 * 支持可控时钟，便于测「过期/TTL」而不 sleep。
 */
export interface FakeRedis extends RedisClient {
  /** 直接看原始存储（断言 TTL/值用） */
  store: Map<string, { value: string; expireAt: number | null }>
  sets: Map<string, Set<string>>
  /** 命令调用记录（断言「是否真的走了 Redis」） */
  calls: { cmd: string; args: unknown[] }[]
  /** 推进时钟（毫秒），让 TTL 过期 */
  advance(ms: number): void
}

export function createFakeRedis(startAt: number = Date.now()): FakeRedis {
  let now = startAt
  const store = new Map<string, { value: string; expireAt: number | null }>()
  const sets = new Map<string, Set<string>>()
  const setExpiry = new Map<string, number | null>()
  const calls: { cmd: string; args: unknown[] }[] = []

  const aliveSet = (key: string): Set<string> | null => {
    const set = sets.get(key)
    if (!set) return null
    const exp = setExpiry.get(key)
    if (exp != null && exp <= now) {
      sets.delete(key)
      setExpiry.delete(key)
      return null
    }
    return set
  }

  const aliveValue = (key: string): { value: string; expireAt: number | null } | null => {
    const entry = store.get(key)
    if (!entry) return null
    if (entry.expireAt != null && entry.expireAt <= now) {
      store.delete(key)
      return null
    }
    return entry
  }

  const client: FakeRedis = {
    store,
    sets,
    calls,
    advance(ms: number) {
      now += ms
    },
    async get(key) {
      calls.push({ cmd: 'get', args: [key] })
      return aliveValue(key)?.value ?? null
    },
    async setPx(key, value, ttlMs) {
      calls.push({ cmd: 'setPx', args: [key, value, ttlMs] })
      store.set(key, { value, expireAt: now + ttlMs })
    },
    async del(keys) {
      calls.push({ cmd: 'del', args: keys })
      let removed = 0
      for (const key of keys) {
        if (store.delete(key)) removed++
        if (sets.delete(key)) {
          sets.delete(key)
          setExpiry.delete(key)
          removed++
        }
      }
      return removed
    },
    async sadd(key, members) {
      calls.push({ cmd: 'sadd', args: [key, members] })
      let set = aliveSet(key)
      if (!set) {
        set = new Set<string>()
        sets.set(key, set)
        setExpiry.set(key, null)
      }
      let added = 0
      for (const m of members) if (!set.has(m)) { set.add(m); added++ }
      return added
    },
    async smembers(key) {
      calls.push({ cmd: 'smembers', args: [key] })
      return Array.from(aliveSet(key) ?? [])
    },
    async expireSeconds(key, seconds) {
      calls.push({ cmd: 'expireSeconds', args: [key, seconds] })
      if (store.has(key)) {
        const entry = store.get(key)!
        entry.expireAt = now + seconds * 1000
        return 1
      }
      if (sets.has(key)) {
        setExpiry.set(key, now + seconds * 1000)
        return 1
      }
      return 0
    },
    async incr(key) {
      calls.push({ cmd: 'incr', args: [key] })
      const entry = aliveValue(key)
      const next = entry ? Number(entry.value) + 1 : 1
      store.set(key, { value: String(next), expireAt: entry?.expireAt ?? null })
      return next
    },
    async pexpire(key, ms) {
      calls.push({ cmd: 'pexpire', args: [key, ms] })
      const entry = store.get(key)
      if (!entry) return 0
      entry.expireAt = now + ms
      return 1
    },
    async pttl(key) {
      calls.push({ cmd: 'pttl', args: [key] })
      const entry = aliveValue(key)
      if (!entry || entry.expireAt == null) return -1
      return Math.max(0, entry.expireAt - now)
    },
    async scanPrefix(prefix) {
      calls.push({ cmd: 'scanPrefix', args: [prefix] })
      const out: string[] = []
      for (const key of Array.from(store.keys())) if (key.startsWith(prefix)) out.push(key)
      for (const key of Array.from(sets.keys())) if (key.startsWith(prefix)) out.push(key)
      return out
    },
    async ping() {
      calls.push({ cmd: 'ping', args: [] })
    },
  }

  return client
}
