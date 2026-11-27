/**
 * 本地优先读取层（lib/modules/offline/local-first.ts）核心编排单测。
 *
 * 为什么单测这东西：这里的每个分支都对应线上一种真实状态（冷启动没缓存、断网、切账号、
 * 云端返回脏数据、会话过期…），而这些分支在 E2E 里很难全部构造出来（尤其 401 与脏数据）。
 * 单测通过注入 store/env 把「时间、网络、账号」全部变成可控输入，逐条钉死行为。
 *
 * 层与职责：
 *  · parseLocalFirstEnvelope / computeLocalFirstFreshness：纯函数（信封校验、新鲜度分级）；
 *  · runLocalFirstRefresh：编排（读本地 → 判断要不要拉 → 网络 → 写回 / 回退 / 清缓存）。
 * 页面侧（localFirst / readLocalFirstSync）依赖 window/IndexedDB，由 Playwright 覆盖（tests/e2e/local-first.spec.ts）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApiError } from '@/lib/client/api'
import {
  LOCAL_FIRST_ENVELOPE_VERSION,
  computeLocalFirstFreshness,
  parseLocalFirstEnvelope,
  resetLocalFirstRefreshState,
  runLocalFirstRefresh,
  type LocalFirstConfig,
  type LocalFirstEnv,
  type LocalFirstRecord,
  type LocalFirstSnapshot,
  type LocalFirstStore,
} from '@/lib/modules/offline/local-first'

/** 内存版 store：记录写入次数/删除次数，可注入初始快照 */
function createStore<T>(initial: { data: T; updatedAt: number } | null = null) {
  const state = {
    record: initial as LocalFirstRecord<T> | null,
    writes: [] as T[],
    removes: 0,
    reads: 0,
  }
  const store: LocalFirstStore<T> = {
    key: 'test',
    readSync: () => state.record,
    read: async () => {
      state.reads += 1
      return state.record
    },
    write: async (data: T) => {
      state.writes.push(data)
      state.record = { data, updatedAt: THE_CLOCK.now }
    },
    remove: async () => {
      state.removes += 1
      state.record = null
    },
  }
  return { store, state }
}

/** 可控时钟：测试里所有「多久之前」都通过它表达 */
const THE_CLOCK = {
  now: 1_700_000_000_000,
  advance(ms: number) {
    this.now += ms
  },
}

function createEnv(overrides: Partial<LocalFirstEnv> = {}): LocalFirstEnv {
  return {
    isOnline: async () => true,
    isSaveData: () => false,
    now: () => THE_CLOCK.now,
    ...overrides,
  }
}

function snapshotOf<T>(data: T, updatedAt: number, ttlMs = 60_000, hardTtlMs = 86_400_000): LocalFirstSnapshot<T> {
  const ageMs = Math.max(0, THE_CLOCK.now - updatedAt)
  return { data, updatedAt, ageMs, freshness: computeLocalFirstFreshness(ageMs, ttlMs, hardTtlMs) }
}

function configOf<T>(remote: () => Promise<T>, extra: Partial<LocalFirstConfig<T>> = {}): LocalFirstConfig<T> {
  return {
    key: 'unit-test-' + Math.random().toString(36).slice(2),
    ttlMs: 60_000,
    hardTtlMs: 86_400_000,
    fetchRemote: remote,
    ...extra,
  }
}

beforeEach(() => {
  THE_CLOCK.now = 1_700_000_000_000
  resetLocalFirstRefreshState()
})

describe('computeLocalFirstFreshness', () => {
  it('软新鲜期内 → fresh', () => {
    expect(computeLocalFirstFreshness(0, 60_000, 86_400_000)).toBe('fresh')
    expect(computeLocalFirstFreshness(60_000, 60_000, 86_400_000)).toBe('fresh')
  })
  it('软过期但未到硬过期 → stale（先渲染再对齐）', () => {
    expect(computeLocalFirstFreshness(60_001, 60_000, 86_400_000)).toBe('stale')
    expect(computeLocalFirstFreshness(86_400_000, 60_000, 86_400_000)).toBe('stale')
  })
  it('超过硬新鲜期 → expired（必须先走网络）', () => {
    expect(computeLocalFirstFreshness(86_400_001, 60_000, 86_400_000)).toBe('expired')
  })
  it('hardTtl<=0 表示不设硬过期：永远最多 stale', () => {
    expect(computeLocalFirstFreshness(10 ** 12, 60_000, 0)).toBe('stale')
  })
})

describe('parseLocalFirstEnvelope（版本/结构校验）', () => {
  it('正常信封', () => {
    const env = parseLocalFirstEnvelope({ v: 2, updatedAt: 123, data: [1, 2] }, 2)
    expect(env).toEqual({ v: 2, updatedAt: 123, data: [1, 2] })
  })
  it('版本不一致 → null（旧结构不进渲染路径）', () => {
    expect(parseLocalFirstEnvelope({ v: 1, updatedAt: 123, data: [] }, 2)).toBeNull()
  })
  it('缺字段 / 非法时间戳 → null', () => {
    expect(parseLocalFirstEnvelope({ v: 2, data: [] }, 2)).toBeNull()
    expect(parseLocalFirstEnvelope({ v: 2, updatedAt: 0, data: [] }, 2)).toBeNull()
    expect(parseLocalFirstEnvelope({ v: 2, updatedAt: Number.NaN, data: [] }, 2)).toBeNull()
    expect(parseLocalFirstEnvelope(null, 2)).toBeNull()
    expect(parseLocalFirstEnvelope('oops', 2)).toBeNull()
  })
  it('结构校验失败 → null（损坏数据当作未命中）', () => {
    const validate = (value: unknown): value is number[] => Array.isArray(value)
    expect(parseLocalFirstEnvelope({ v: 2, updatedAt: 123, data: { nope: true } }, 2, validate)).toBeNull()
    expect(parseLocalFirstEnvelope({ v: 2, updatedAt: 123, data: [1] }, 2, validate)).toEqual({
      v: 2,
      updatedAt: 123,
      data: [1],
    })
  })
  it('默认信封版本常量可用', () => {
    expect(LOCAL_FIRST_ENVELOPE_VERSION).toBeGreaterThan(0)
  })
})

describe('runLocalFirstRefresh', () => {
  it('无本地 + 云端成功 → remote，并写回本地', async () => {
    const { store, state } = createStore<number[]>(null)
    const result = await runLocalFirstRefresh(configOf(async () => [1, 2, 3]), store, null, createEnv())
    expect(result.source).toBe('remote')
    expect(result.data).toEqual([1, 2, 3])
    expect(result.offline).toBe(false)
    expect(state.writes).toEqual([[1, 2, 3]])
  })

  it('本地 fresh + 离线 → 只渲染本地，不发请求（offline=true）', async () => {
    const fetchRemote = vi.fn(async () => [9])
    const { store } = createStore<number[]>({ data: [1], updatedAt: THE_CLOCK.now - 1_000 })
    const hit = snapshotOf([1], THE_CLOCK.now - 1_000)
    const result = await runLocalFirstRefresh(
      configOf(fetchRemote),
      store,
      hit,
      createEnv({ isOnline: async () => false }),
    )
    expect(fetchRemote).not.toHaveBeenCalled()
    expect(result.skipped).toBe(true)
    expect(result.skipReason).toBe('offline')
    expect(result.offline).toBe(true)
    expect(result.data).toEqual([1])
    expect(result.error).toBe('')
  })

  it('无本地 + 离线 → 明确报错（不是静默空白）', async () => {
    const result = await runLocalFirstRefresh(
      configOf(async () => [1]),
      createStore<number[]>(null).store,
      null,
      createEnv({ isOnline: async () => false }),
    )
    expect(result.skipped).toBe(true)
    expect(result.data).toBeNull()
    expect(result.error).toContain('离线')
  })

  it('省流量模式 → 不后台拉取，保留本地', async () => {
    const fetchRemote = vi.fn(async () => [9])
    const hit = snapshotOf([1], THE_CLOCK.now - 120_000) // stale
    const result = await runLocalFirstRefresh(
      configOf(fetchRemote),
      createStore<number[]>().store,
      hit,
      createEnv({ isSaveData: () => true }),
    )
    expect(fetchRemote).not.toHaveBeenCalled()
    expect(result.skipped).toBe(true)
    expect(result.skipReason).toBe('save-data')
    expect(result.data).toEqual([1])
  })

  it('刚拉过 + 本地仍 fresh → 抑制重复请求（recent），force 可绕过', async () => {
    const fetchRemote = vi.fn(async () => [2])
    const cfg = configOf(fetchRemote)
    const { store } = createStore<number[]>()
    const first = await runLocalFirstRefresh(cfg, store, null, createEnv())
    expect(first.source).toBe('remote')

    const hit = snapshotOf([2], THE_CLOCK.now)
    THE_CLOCK.advance(1_000)
    const second = await runLocalFirstRefresh(cfg, store, hit, createEnv())
    expect(second.skipped).toBe(true)
    expect(second.skipReason).toBe('recent')
    expect(fetchRemote).toHaveBeenCalledTimes(1)

    const forced = await runLocalFirstRefresh({ ...cfg, force: true }, store, hit, createEnv())
    expect(fetchRemote).toHaveBeenCalledTimes(2)
    expect(forced.source).toBe('remote')
  })

  it('本地 stale（超过软新鲜期）→ 必须后台拉取', async () => {
    const fetchRemote = vi.fn(async () => [3])
    const hit = snapshotOf([1], THE_CLOCK.now - 5 * 60_000) // 5 分钟前：stale
    expect(hit.freshness).toBe('stale')
    const result = await runLocalFirstRefresh(configOf(fetchRemote), createStore<number[]>().store, hit, createEnv())
    expect(fetchRemote).toHaveBeenCalledTimes(1)
    expect(result.source).toBe('remote')
    expect(result.data).toEqual([3])
  })

  it('网络失败 + 有本地 → 退回本地并标记 offline（不清空内容）', async () => {
    const hit = snapshotOf([1], THE_CLOCK.now - 3 * 86_400_000) // 超过硬新鲜期也照样兜底
    expect(hit.freshness).toBe('expired')
    const result = await runLocalFirstRefresh(
      configOf(async () => {
        throw new Error('Failed to fetch')
      }),
      createStore<number[]>().store,
      hit,
      createEnv(),
    )
    expect(result.source).toBe('local')
    expect(result.offline).toBe(true)
    expect(result.data).toEqual([1])
    expect(result.error).toBe('')
    expect(result.hit?.data).toEqual([1])
  })

  it('网络失败 + 调用方没带 hit → 从 store 再读一次兜底', async () => {
    const { store } = createStore<number[]>({ data: [7], updatedAt: THE_CLOCK.now - 1_000 })
    const result = await runLocalFirstRefresh(
      configOf(async () => {
        throw new Error('Failed to fetch')
      }),
      store,
      null,
      createEnv(),
    )
    expect(result.source).toBe('local')
    expect(result.data).toEqual([7])
  })

  it('网络失败 + 无本地 → 错误态', async () => {
    const result = await runLocalFirstRefresh(
      configOf(async () => {
        throw new Error('Failed to fetch')
      }),
      createStore<number[]>(null).store,
      null,
      createEnv(),
    )
    expect(result.source).toBe('none')
    expect(result.data).toBeNull()
    expect(result.error).toBe('Failed to fetch')
  })

  it('401（会话失效）→ 清本地缓存并上报登录失效，绝不把旧账号数据留在盘上', async () => {
    const { store, state } = createStore<number[]>({ data: [1], updatedAt: THE_CLOCK.now - 1_000 })
    const result = await runLocalFirstRefresh(
      configOf(async () => {
        throw new ApiError('登录状态已失效，请重新登录', 401)
      }),
      store,
      snapshotOf([1], THE_CLOCK.now - 1_000),
      createEnv(),
    )
    expect(state.removes).toBe(1)
    expect(result.source).toBe('none')
    expect(result.data).toBeNull()
    expect(result.error).toContain('登录')
  })

  it('云端返回不符合结构契约 → 拒绝写入，保留本地旧数据', async () => {
    const validate = (value: unknown): value is number[] => Array.isArray(value)
    const { store, state } = createStore<number[]>()
    const hit = snapshotOf([1], THE_CLOCK.now - 1_000)
    const result = await runLocalFirstRefresh(
      configOf(async () => ({ broken: true }) as unknown as number[], { validate }),
      store,
      hit,
      createEnv(),
    )
    expect(state.writes).toEqual([])
    expect(result.source).toBe('local')
    expect(result.data).toEqual([1])
    expect(result.error).toContain('校验')
  })

  it('并发调用只发一次网络（切页/下拉刷新撞车）', async () => {
    const fetchRemote = vi.fn(async () => [5])
    const { store } = createStore<number[]>()
    const cfg = configOf(fetchRemote)
    // 同一 tick 两次调用：第二次必须复用第一次登记的 promise，而不是再发一次网络
    const first = runLocalFirstRefresh(cfg, store, null, createEnv())
    const second = runLocalFirstRefresh(cfg, store, null, createEnv())
    const [a, b] = await Promise.all([first, second])
    expect(fetchRemote).toHaveBeenCalledTimes(1)
    expect(a.data).toEqual([5])
    expect(b.data).toEqual([5])
  })

  it('永不 reject：fetchRemote 抛非 Error 也不会把页面打崩', async () => {
    const result = await runLocalFirstRefresh(
      configOf(async () => {
        throw 'weird-failure'
      }),
      createStore<number[]>().store,
      null,
      createEnv(),
    )
    expect(result.source).toBe('none')
    expect(result.error).toBe('weird-failure')
  })
})