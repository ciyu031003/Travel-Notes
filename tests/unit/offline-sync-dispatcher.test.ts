/**
 * 离线同步分发器 · 响应解析回归
 *
 * 这里锁的是一个**静默失效**级缺陷：分发器起初只认 `{ data: { id } }`，
 * 而项目里的写接口返回的是 `{ success, id, slug }`（见 app/api/admin/travels/route.ts）。
 * 结果 remoteId 永远是 undefined →
 *   · 本地行 remoteId 恒为 NULL，`pendingSync` 恒为 true；
 *   · 详情页 `canWrite = travelId > 0 && !pendingSync` 恒为 false。
 * 真机表现：新建的旅行永远显示「还在本地待同步」，**没有编辑/添加行程/删除按钮**，
 * 而它其实早已上传成功（队列已 markDone，不会重试）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/api-base', () => ({ apiUrl: (p: string) => 'https://example.test' + p }))

import { HttpSyncDispatcher } from '@/lib/modules/offline/sync-dispatcher'
import type { SyncQueueItem } from '@/lib/modules/offline/types'

function travelItem(): SyncQueueItem {
  return {
    id: 1,
    entityType: 'TRAVEL',
    entityId: 'local-1',
    remoteId: null,
    operation: 'CREATE',
    payload: JSON.stringify({ title: '大理 5 天' }),
    retryCount: 0,
    status: 'PENDING',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as unknown as SyncQueueItem
}

function mockJson(body: unknown, ok = true) {
  return vi.fn(async () => ({
    ok,
    status: ok ? 201 : 400,
    json: async () => body,
  })) as unknown as typeof fetch
}

const dispatcher = new HttpSyncDispatcher()

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HttpSyncDispatcher 响应解析', () => {
  it('认顶层 { success, id, slug }（项目实际的写接口形状）', async () => {
    vi.stubGlobal('fetch', mockJson({ success: true, id: 42, slug: 'da-li-5-tian' }))
    const r = await dispatcher.upload(travelItem())
    expect(r.remoteId).toBe(42)
    expect(r.slug).toBe('da-li-5-tian')
  })

  it('也认 { data: { id } }（早期约定的形状）', async () => {
    vi.stubGlobal('fetch', mockJson({ data: { id: 7 } }))
    const r = await dispatcher.upload(travelItem())
    expect(r.remoteId).toBe(7)
  })

  it('无 id 时返回 undefined（而不是抛错）—— 调用方据此保持待同步态', async () => {
    vi.stubGlobal('fetch', mockJson({ success: true }))
    const r = await dispatcher.upload(travelItem())
    expect(r.remoteId).toBeUndefined()
  })

  it('id 为 0 / 负数 / 非数字时视为无效', async () => {
    for (const bad of [0, -3, 'abc', null]) {
      vi.stubGlobal('fetch', mockJson({ success: true, id: bad }))
      const r = await dispatcher.upload(travelItem())
      expect(r.remoteId).toBeUndefined()
    }
  })

  it('HTTP 失败时抛错（由同步引擎记 FAILED 并退避重试）', async () => {
    vi.stubGlobal('fetch', mockJson({ error: 'boom' }, false))
    await expect(dispatcher.upload(travelItem())).rejects.toThrow('HTTP 400')
  })

  it('TRAVEL 走 /api/admin/travels（POST）', async () => {
    const fetchMock = mockJson({ success: true, id: 1 })
    vi.stubGlobal('fetch', fetchMock)
    await dispatcher.upload(travelItem())
    const [url, init] = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/admin/travels')
    expect(init.method).toBe('POST')
  })
})
