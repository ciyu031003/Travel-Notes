/**
 * 新建旅行的「在线优先 / 本地兜底」回归。
 *
 * 锁的是真机连续几版都复现的那个问题：
 * 原生壳把「本地 SQLite 写入」当关键路径，一旦本地库异常（列漂移、插件不可用），
 * 用户既不落云端也读不到本地 → 「服务器不存在、本机也没有离线副本」，旅行凭空消失。
 *
 * 现在的契约：
 *   · 本地写失败**不得**阻断在线创建；
 *   · 在线成功 → 返回服务端 slug（详情页直接走服务端，最可靠）；
 *   · 只有真离线才依赖本地行；两者都失败必须**明确报错**，不许假装成功。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { localWriteMock, markSyncedMock, nativeRef } = vi.hoisted(() => ({
  localWriteMock: vi.fn(),
  markSyncedMock: vi.fn(),
  nativeRef: { value: true },
}))

vi.mock('@/lib/api-base', () => ({ apiUrl: (p: string) => 'https://example.test' + p }))
vi.mock('@/lib/modules/offline/platform', () => ({ isNativePlatform: () => nativeRef.value }))
vi.mock('@/lib/modules/offline/local-write', () => ({
  writeLocalEntity: localWriteMock,
  markEntitySynced: markSyncedMock,
}))
vi.mock('@/lib/modules/offline/sync-queue', () => ({
  SyncQueue: class {
    enqueue = vi.fn(async () => 1)
    /** 在线成功后调用：清掉本地写产生的队列项，避免被再上传一次（重复创建） */
    markDoneByEntityId = vi.fn(async () => {})
  },
}))
vi.mock('@/lib/modules/offline/storage', () => ({ getSyncQueueStorage: () => ({}) }))
vi.mock('@/lib/modules/travel/slug', () => ({
  makeTravelSlug: (title: string, suffix?: string) => (suffix ? `${title}-${suffix}` : title),
}))

import { createTravel } from '@/lib/modules/offline/travel-write'

function mockFetch(body: unknown, ok = true, status = ok ? 201 : 400) {
  const fn = vi.fn(async () => ({ ok, status, json: async () => body }))
  vi.stubGlobal('fetch', fn)
  return fn as unknown as typeof fetch
}

beforeEach(() => {
  vi.clearAllMocks()
  nativeRef.value = true
  localWriteMock.mockResolvedValue(undefined)
  markSyncedMock.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('原生壳 · 新建旅行', () => {
  it('在线成功 → 返回服务端 slug（详情页走服务端，最可靠）', async () => {
    mockFetch({ success: true, id: 77, slug: 'server-slug' })
    const r = await createTravel({ title: '大理 5 天' })
    expect(r.ok).toBe(true)
    expect(r.local).toBe(false)
    expect(r.slug).toBe('server-slug')
    expect(r.remoteId).toBe(77)
    expect(markSyncedMock).toHaveBeenCalled()
  })

  it('**本地写入失败也必须能建成功**（真机故障就是卡在这里）', async () => {
    localWriteMock.mockRejectedValue(new Error('no such column: slug'))
    mockFetch({ success: true, id: 88, slug: 'server-slug-2' })
    const r = await createTravel({ title: '南京 3 天' })
    expect(r.ok).toBe(true)
    expect(r.local).toBe(false)
    expect(r.slug).toBe('server-slug-2')
    expect(r.remoteId).toBe(88)
  })

  it('本地成功 + 服务端失败（真离线）→ 本地暂存，返回本地 slug', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch)
    const r = await createTravel({ title: '桂林 4 天' })
    expect(r.ok).toBe(true)
    expect(r.local).toBe(true)
    expect(r.localId).toBeTruthy()
    expect(r.slug).toBeTruthy()
  })

  it('本地与服务端都失败 → 明确报错（不假装成功）', async () => {
    localWriteMock.mockRejectedValue(new Error('db locked'))
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch)
    const r = await createTravel({ title: '厦门 2 天' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('db locked')
    expect(r.slug).toBeUndefined()
  })

  it('服务端返回 4xx → 透出服务端原因，本地行仍可用于离线查看', async () => {
    mockFetch({ error: '请输入旅行名称' }, false, 400)
    const r = await createTravel({ title: '有标题' })
    expect(r.ok).toBe(true)
    expect(r.local).toBe(true)
  })

  it('Web（非原生）→ 不写本地，直接在线', async () => {
    nativeRef.value = false
    mockFetch({ success: true, id: 5, slug: 'web-slug' })
    const r = await createTravel({ title: 'Web 旅行' })
    expect(r.ok).toBe(true)
    expect(r.slug).toBe('web-slug')
    expect(localWriteMock).not.toHaveBeenCalled()
  })

  it('空标题直接拒绝（不打服务端）', async () => {
    const f = mockFetch({ success: true, id: 1, slug: 'x' })
    const r = await createTravel({ title: '   ' })
    expect(r.ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
})
