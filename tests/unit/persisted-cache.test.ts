import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  PERSISTED_MAX_ENTRY_BYTES,
  clearPersistedCache,
  dropPersistedCache,
  inspectPersistedCache,
  persistSoon,
  readPersistedCache,
  writePersistedCache,
} from '@/lib/client/persisted-cache'

/**
 * lib/client/persisted-cache 单测（E1 本地优先水合的存储层）。
 *
 * 为什么值得单测：这一层是「打开 App 立刻有内容」的地基，且**所有失败路径都必须静默降级**
 * （隐私模式禁用 localStorage、配额满、坏数据、超大响应）。这些条件在真机上很难复现，
 * 但一旦处理不对就是白屏/卡死，所以用假 Storage 把每条降级路径都钉死。
 */

/** 最小可用的 localStorage 假实现；可开关「配额异常」与「访问即抛」 */
class FakeStorage {
  map = new Map<string, string>()
  quotaErrorOnNextSet = 0
  throwOnAccess = false

  private guard(): void {
    // 模拟 Safari 无痕/沙箱 iframe：**任何**访问都抛 SecurityError
    if (this.throwOnAccess) throw new Error('access denied')
  }

  get length() {
    this.guard()
    return this.map.size
  }

  key(index: number): string | null {
    this.guard()
    return Array.from(this.map.keys())[index] ?? null
  }

  getItem(key: string): string | null {
    this.guard()
    return this.map.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.guard()
    if (this.quotaErrorOnNextSet > 0) {
      this.quotaErrorOnNextSet -= 1
      const err = new Error('quota exceeded')
      err.name = 'QuotaExceededError'
      throw err
    }
    this.map.set(key, value)
  }

  removeItem(key: string): void {
    this.guard()
    this.map.delete(key)
  }
}

let storage: FakeStorage

beforeEach(() => {
  storage = new FakeStorage()
  // 模块内部只用 typeof window + window.localStorage，用假对象就够了
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    addEventListener: vi.fn(),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    requestAnimationFrame: (cb: () => void) => {
      cb()
      return 0
    },
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    cancelAnimationFrame: vi.fn(),
  }
  ;(globalThis as unknown as { document: unknown }).document = {
    addEventListener: vi.fn(),
    visibilityState: 'visible',
  }
})

afterEach(() => {
  clearPersistedCache()
  delete (globalThis as unknown as { window?: unknown }).window
  delete (globalThis as unknown as { document?: unknown }).document
})

describe('readPersistedCache / writePersistedCache 基本往返', () => {
  it('写入后能按 key 读回（值 + 落盘时间）', () => {
    expect(writePersistedCache('/api/travels', { posts: [{ slug: 'a' }] })).toBe(true)
    const hit = readPersistedCache<{ posts: { slug: string }[] }>('/api/travels')
    expect(hit).not.toBeNull()
    expect(hit?.value.posts[0].slug).toBe('a')
    expect(typeof hit?.at).toBe('number')
  })

  it('key 带 schema 版本前缀，便于整体作废旧快照', () => {
    writePersistedCache('/api/home', { ok: 1 })
    expect(Array.from(storage.map.keys()).some((k) => k.startsWith('tn:pc:v1:'))).toBe(true)
  })

  it('不同 key 互不影响', () => {
    writePersistedCache('/api/a', 1)
    writePersistedCache('/api/b', 2)
    expect(readPersistedCache('/api/a')?.value).toBe(1)
    expect(readPersistedCache('/api/b')?.value).toBe(2)
    dropPersistedCache('/api/a')
    expect(readPersistedCache('/api/a')).toBeNull()
    expect(readPersistedCache('/api/b')?.value).toBe(2)
  })
})

describe('降级路径（都不能抛，也不能阻塞首屏）', () => {
  it('过期快照视为未命中，并顺手清掉', () => {
    writePersistedCache('/api/album', { cities: [] })
    // 把落盘时间改老（ttlMs <= 0 的语义是「不看时间」，所以只能改时间戳来构造过期）
    const key = 'tn:pc:v1:/api/album'
    const env = JSON.parse(storage.map.get(key) as string)
    env.at = Date.now() - 25 * 60 * 60 * 1000
    storage.map.set(key, JSON.stringify(env))
    expect(readPersistedCache('/api/album')).toBeNull()
    expect(storage.map.size).toBe(0)
  })

  it('ttlMs <= 0 表示不看时间（供「永久可用直到被淘汰」的场景）', () => {
    writePersistedCache('/api/danmaku', { list: [] })
    const key = 'tn:pc:v1:/api/danmaku'
    const env = JSON.parse(storage.map.get(key) as string)
    env.at = Date.now() - 30 * 24 * 60 * 60 * 1000
    storage.map.set(key, JSON.stringify(env))
    expect(readPersistedCache('/api/danmaku', { ttlMs: 0 })?.value).toEqual({ list: [] })
  })

  it('坏 JSON 视为未命中并清理', () => {
    storage.map.set('tn:pc:v1:/api/home', '{not json')
    expect(readPersistedCache('/api/home')).toBeNull()
    expect(storage.map.size).toBe(0)
  })

  it('schema 版本不符（旧快照）视为未命中并清理', () => {
    storage.map.set('tn:pc:v1:/api/home', JSON.stringify({ v: 0, at: Date.now(), d: { stale: true } }))
    expect(readPersistedCache('/api/home')).toBeNull()
    expect(storage.map.size).toBe(0)
  })

  it('单条超过上限不落盘（避免巨大响应吃光配额）', () => {
    const big = { blob: 'x'.repeat(PERSISTED_MAX_ENTRY_BYTES) }
    expect(writePersistedCache('/api/album', big)).toBe(false)
    expect(storage.map.size).toBe(0)
  })

  it('配额不足时清理后重试一次（不会把异常抛给调用方）', () => {
    writePersistedCache('/api/travels', { old: true })
    storage.quotaErrorOnNextSet = 1
    // 第一次 setItem 抛 QuotaExceededError → 模块内部清理 + 重试 → 成功
    expect(writePersistedCache('/api/home', { ok: true })).toBe(true)
    expect(readPersistedCache('/api/home')?.value).toEqual({ ok: true })
  })

  it('localStorage 访问即抛（Safari 无痕/沙箱）时读写都安全降级', () => {
    storage.throwOnAccess = true
    expect(() => writePersistedCache('/api/me', { id: 1 })).not.toThrow()
    expect(() => readPersistedCache('/api/me')).not.toThrow()
    expect(readPersistedCache('/api/me')).toBeNull()
    expect(() => clearPersistedCache()).not.toThrow()
  })

  it('服务端（没有 window）时读写都是空操作', () => {
    delete (globalThis as unknown as { window?: unknown }).window
    expect(writePersistedCache('/api/home', { ok: 1 })).toBe(false)
    expect(readPersistedCache('/api/home')).toBeNull()
    expect(inspectPersistedCache()).toEqual([])
  })
})

describe('清理与延迟落盘', () => {
  it('clearPersistedCache 只清本命名空间，不动站内其它 key', () => {
    writePersistedCache('/api/home', { ok: 1 })
    storage.setItem('theme', 'dark')
    storage.setItem('tn:pc:v0:/api/legacy', '{}')
    clearPersistedCache()
    expect(Array.from(storage.map.keys())).toEqual(['theme'])
  })

  it('inspectPersistedCache 列出 key（不带前缀）与体积', () => {
    writePersistedCache('/api/timeline', { years: [] })
    const list = inspectPersistedCache()
    expect(list.map((x) => x.key)).toEqual(['/api/timeline'])
    expect(list[0].bytes).toBeGreaterThan(0)
  })

  it('persistSoon 延迟落盘：下一帧后才真正写入', async () => {
    persistSoon('/api/home', { ok: 1 })
    // 假 rAF 是同步的，但 flush 排到 setTimeout(0)
    await new Promise((r) => setTimeout(r, 10))
    expect(readPersistedCache('/api/home')?.value).toEqual({ ok: 1 })
  })

  it('persistSoon 同一 key 连续两次只保留最后一次', async () => {
    persistSoon('/api/home', { v: 1 })
    persistSoon('/api/home', { v: 2 })
    await new Promise((r) => setTimeout(r, 10))
    expect(readPersistedCache('/api/home')?.value).toEqual({ v: 2 })
    expect(inspectPersistedCache()).toHaveLength(1)
  })
})
