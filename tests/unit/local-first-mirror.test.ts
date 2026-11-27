/**
 * 本地优先读取层的「同步镜像」路径单测（readLocalFirstSync / createLocalFirstStore）。
 *
 * 为什么单独一个文件：这条路径依赖 window.localStorage，必须在 node 里搭一个最小
 * localStorage/window 替身才能跑（不能上 jsdom —— 项目没装，也不想为一条缓存路径加依赖）。
 * 这里覆盖的是页面首帧真正走的那几行：
 *  · 写 → 下一帧落镜像 → readLocalFirstSync 同步读回（不 await、不闪骨架）；
 *  · schemaVersion 不匹配 → 当作未命中（旧结构不进渲染）；
 *  · updatedAt 决定 fresh / stale / expired 三档；
 *  · 账号作用域前缀（换号后读不到上一个账号的镜像）；
 *  · clearLocalFirstCache 清镜像 + 抹掉账号标记。
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  clearLocalFirstCache,
  createLocalFirstStore,
  ensureLocalFirstScope,
  getLocalFirstScope,
  readLocalFirstSync,
  resetLocalFirstScopeCache,
  type LocalFirstConfigBase,
} from '@/lib/modules/offline/local-first'

/** 最小 localStorage 替身（行为与浏览器一致：setItem 覆盖、key(i) 按插入序） */
function createFakeLocalStorage(): Storage {
  const map = new Map<string, string>()
  const fake = {
    get length() {
      return map.size
    },
    key(index: number): string | null {
      return Array.from(map.keys())[index] ?? null
    },
    getItem(key: string): string | null {
      return map.has(key) ? (map.get(key) as string) : null
    },
    setItem(key: string, value: string): void {
      map.set(key, String(value))
    },
    removeItem(key: string): void {
      map.delete(key)
    },
    clear(): void {
      map.clear()
    },
  }
  return fake as unknown as Storage
}

const fakeLocalStorage = createFakeLocalStorage()

beforeEach(() => {
  fakeLocalStorage.clear()
  resetLocalFirstScopeCache()
  // window/document 替身：只实现本地优先层会用到的那几个成员，避免引入 jsdom
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: fakeLocalStorage,
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms ?? 0),
    clearTimeout: (id: number) => clearTimeout(id),
    requestAnimationFrame: (fn: (time: number) => void) => setTimeout(() => fn(0), 0),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  ;(globalThis as unknown as { document: unknown }).document = {
    visibilityState: 'visible',
    addEventListener: () => {},
    removeEventListener: () => {},
  }
})

afterAll(() => {
  delete (globalThis as unknown as { window?: unknown }).window
  delete (globalThis as unknown as { document?: unknown }).document
})

/** persistSoon 把写入推到下一帧（setTimeout 0）→ 等一轮宏任务再断言 */
function flushMirror(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20))
}

const baseConfig: LocalFirstConfigBase<string[]> = {
  key: '/api/unit-mirror',
  ttlMs: 60_000,
  hardTtlMs: 86_400_000,
  schemaVersion: 1,
  validate: (value: unknown): value is string[] => Array.isArray(value),
}

/** 直接改写镜像里的 updatedAt（模拟「上次打开是多久以前」） */
function ageMirror(ageMs: number): void {
  const key = Array.from({ length: fakeLocalStorage.length }, (_, i) => fakeLocalStorage.key(i))
    .filter((k): k is string => !!k)
    .find((k) => k.indexOf('tn:pc:') === 0)
  if (!key) throw new Error('镜像不存在')
  const raw = JSON.parse(fakeLocalStorage.getItem(key) as string) as { v: number; at: number; d: { updatedAt: number } }
  raw.d.updatedAt = Date.now() - ageMs
  fakeLocalStorage.setItem(key, JSON.stringify(raw))
}

describe('readLocalFirstSync（首帧同步镜像）', () => {
  it('写入 → 下一帧落镜像 → 同步读回（fresh）', async () => {
    const store = createLocalFirstStore(baseConfig)
    await store.write(['a', 'b'])
    await flushMirror()
    const hit = readLocalFirstSync(baseConfig)
    expect(hit?.data).toEqual(['a', 'b'])
    expect(hit?.freshness).toBe('fresh')
  })

  it('schemaVersion 不匹配 → 视为未命中（并清掉坏镜像）', async () => {
    const store = createLocalFirstStore(baseConfig)
    await store.write(['a'])
    await flushMirror()
    expect(readLocalFirstSync(baseConfig)).not.toBeNull()
    // 结构升级：旧版缓存必须失效
    expect(readLocalFirstSync({ ...baseConfig, schemaVersion: 2 })).toBeNull()
    expect(fakeLocalStorage.length).toBe(0)
  })

  it('结构校验失败 → 视为未命中（损坏数据不进渲染）', async () => {
    // 绕过 store 直接伪造一条「信封版本对、但 data 不是数组」的镜像
    const raw = JSON.stringify({ v: 1, at: Date.now(), d: { v: 1, updatedAt: Date.now(), data: { nope: true } } })
    fakeLocalStorage.setItem('tn:pc:v1:lf:anon:/api/unit-mirror', raw)
    expect(readLocalFirstSync(baseConfig)).toBeNull()
  })

  it('按 updatedAt 判新鲜度：1 小时前 = stale，2 天前 = expired', async () => {
    const store = createLocalFirstStore(baseConfig)
    await store.write(['a'])
    await flushMirror()
    ageMirror(60 * 60 * 1000)
    expect(readLocalFirstSync(baseConfig)?.freshness).toBe('stale')
    ageMirror(2 * 24 * 60 * 60 * 1000)
    expect(readLocalFirstSync(baseConfig)?.freshness).toBe('expired')
  })

  it('账号作用域：换号后读不到上一个账号的镜像', async () => {
    const store = createLocalFirstStore(baseConfig)
    await store.write(['old-account'])
    await flushMirror()
    const before = readLocalFirstSync(baseConfig)
    expect(before?.data).toEqual(['old-account'])
    // 模拟登录了一个新账号（作用域标记变化 + 进程内缓存重置）
    fakeLocalStorage.setItem('tn:lf:account', '42')
    resetLocalFirstScopeCache()
    expect(getLocalFirstScope()).toBe('acc:42')
    expect(readLocalFirstSync(baseConfig)).toBeNull()
    // 新账号自己写的数据只在自己的命名空间里
    const ownStore = createLocalFirstStore(baseConfig)
    await ownStore.write(['new-account'])
    await flushMirror()
    expect(readLocalFirstSync(baseConfig)?.data).toEqual(['new-account'])
  })

  it('首次认领账号：anon 镜像原地搬到 acc 命名空间（下次启动直接命中，不白等一次网络）', async () => {
    const store = createLocalFirstStore(baseConfig)
    await store.write(['boot-before-login'])
    await flushMirror()
    expect(getLocalFirstScope()).toBe('anon')
    expect(readLocalFirstSync(baseConfig)?.data).toEqual(['boot-before-login'])

    // 模拟 /api/me 返回账号 42（账号 id 是异步校准出来的）
    const originalFetch = globalThis.fetch
    const calls: string[] = []
    globalThis.fetch = (async (input: unknown) => {
      calls.push(String(input))
      return { ok: true, json: async () => ({ data: { id: 42 } }) }
    }) as unknown as typeof fetch
    try {
      await ensureLocalFirstScope()
    } finally {
      globalThis.fetch = originalFetch
    }
    expect(calls).toEqual(['/api/me'])
    expect(getLocalFirstScope()).toBe('acc:42')
    // 关键：换命名空间后仍然读得到（说明是搬迁而不是丢弃）
    expect(readLocalFirstSync(baseConfig)?.data).toEqual(['boot-before-login'])
    expect(fakeLocalStorage.getItem('tn:lf:account')).toBe('42')
  })

  it('换账号（已有标记且不一致）：清空旧命名空间，不搬迁', async () => {
    fakeLocalStorage.setItem('tn:lf:account', '42')
    resetLocalFirstScopeCache()
    const store = createLocalFirstStore(baseConfig)
    await store.write(['account-42-data'])
    await flushMirror()
    expect(readLocalFirstSync(baseConfig)?.data).toEqual(['account-42-data'])

    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ data: { id: 43 } }) })) as unknown as typeof fetch
    try {
      await ensureLocalFirstScope()
    } finally {
      globalThis.fetch = originalFetch
    }
    expect(getLocalFirstScope()).toBe('acc:43')
    // 上一个账号的镜像必须被清掉（隐私）
    expect(fakeLocalStorage.length).toBe(1)
    expect(fakeLocalStorage.getItem('tn:lf:account')).toBe('43')
    expect(readLocalFirstSync(baseConfig)).toBeNull()
  })

  it('clearLocalFirstCache：清镜像 + 抹掉账号标记（登出后回到 anon）', async () => {
    fakeLocalStorage.setItem('tn:lf:account', '42')
    resetLocalFirstScopeCache()
    const store = createLocalFirstStore(baseConfig)
    await store.write(['x'])
    await flushMirror()
    expect(readLocalFirstSync(baseConfig)?.data).toEqual(['x'])
    await clearLocalFirstCache()
    expect(fakeLocalStorage.length).toBe(0)
    expect(getLocalFirstScope()).toBe('anon')
    expect(readLocalFirstSync(baseConfig)).toBeNull()
  })

  it('remove()：单条失效（写操作成功后调用）', async () => {
    const store = createLocalFirstStore(baseConfig)
    await store.write(['x'])
    await flushMirror()
    expect(readLocalFirstSync(baseConfig)).not.toBeNull()
    await store.remove()
    expect(readLocalFirstSync(baseConfig)).toBeNull()
  })
})