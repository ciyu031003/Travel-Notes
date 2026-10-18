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
/**
 * 社交互动同步回归（2026-10-13）
 *
 * 锁的是一个**线上真实故障**：点赞/收藏/评论在 App 里点了没反应、退出重进就丢。
 * 根因是 SyncQueue.enqueue 已经 JSON.stringify(payload)，而 social-write 入队前
 * **又 stringify 了一次**，于是库里存的是"字符串的 JSON"；分发器只 parse 一次拿到
 * string，payload.postId 为 undefined → 抛「缺少 postId」→ fetch 根本没发出。
 * 表现是队列里三条 FAILED、fetchCount=0。
 *
 * 这里同时钉住三件事：
 *   ① 正常入队 → 单次序列化 → 请求带正确 URL/方法与 body；
 *   ② 历史双重编码的存量队列项仍能解码（老设备升级后不清队列也不会卡死）；
 *   ③ 取消点赞走 DELETE（幂等目标态），保证重放不会把赞翻回来。
 */
function socialItem(entityType: "LIKE" | "FAVORITE" | "COMMENT", operation: "CREATE" | "DELETE", payload: string): SyncQueueItem {
  return {
    id: 9,
    entityType,
    entityId: "local-soc-1",
    remoteId: null,
    operation,
    payload,
    retryCount: 0,
    status: "PENDING",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as unknown as SyncQueueItem
}

describe("社交互动同步（单次序列化 / 历史兼容 / 幂等取消）", () => {
  it("LIKE：队列单次序列化后能发出请求（而不是缺少 postId）", async () => {
    const { SyncQueue, InMemorySyncQueueStorage } = await import("@/lib/modules/offline/sync-queue")
    const queue = new SyncQueue(new InMemorySyncQueueStorage())
    // 与 social-write 一致：传对象，由队列负责序列化
    await queue.enqueue({ entityType: "LIKE", entityId: "e1", remoteId: null, operation: "CREATE", payload: { postId: 42 } })
    const [item] = await queue.pending()
    expect(typeof item.payload).toBe("string")
    // 关键：parse 一次就必须拿到对象（旧实现这里得到的是 string）
    // P1-23：队列项现在额外带幂等键 __clientMutationId（请求头用，发请求体时会被剥掉）
    expect(JSON.parse(item.payload)).toMatchObject({ postId: 42 })
    expect(typeof JSON.parse(item.payload).__clientMutationId).toBe("string")

    const fetchMock = mockJson({ success: true, liked: true, likeCount: 1 })
    vi.stubGlobal("fetch", fetchMock)
    await dispatcher.upload(item)
    const [url, init] = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/social/posts/42/like")
    expect(init.method).toBe("POST")
  })

  it("LIKE 取消：DELETE 打到同一 URL（幂等目标态，重放安全）", async () => {
    const fetchMock = mockJson({ success: true, liked: false, likeCount: 0 })
    vi.stubGlobal("fetch", fetchMock)
    await dispatcher.upload(socialItem("LIKE", "DELETE", JSON.stringify({ postId: 42 })))
    const [url, init] = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/social/posts/42/like")
    expect(init.method).toBe("DELETE")
  })

  it("FAVORITE / COMMENT 路由到各自接口", async () => {
    const cases: Array<["FAVORITE" | "COMMENT", string]> = [
      ["FAVORITE", "/api/social/posts/7/favorite"],
      ["COMMENT", "/api/social/posts/7/comments"],
    ]
    for (const [type, expected] of cases) {
      const fetchMock = mockJson({ success: true, id: 1 })
      vi.stubGlobal("fetch", fetchMock)
      await dispatcher.upload(socialItem(type, "CREATE", JSON.stringify({ postId: 7, content: "hi" })))
      const [url] = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit]
      expect(url).toContain(expected)
    }
  })

  it("历史双重编码的队列项仍能解码（老设备升级不清队列也不卡死）", async () => {
    const fetchMock = mockJson({ success: true, liked: true, likeCount: 1 })
    vi.stubGlobal("fetch", fetchMock)
    // 旧实现写进去的形态：JSON.stringify(JSON.stringify({postId:42}))
    const legacy = JSON.stringify(JSON.stringify({ postId: 42 }))
    await dispatcher.upload(socialItem("LIKE", "CREATE", legacy))
    const [url] = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/social/posts/42/like")
  })

  it("缺少 postId 时明确报错（不静默成功）", async () => {
    vi.stubGlobal("fetch", mockJson({ success: true }))
    await expect(dispatcher.upload(socialItem("LIKE", "CREATE", JSON.stringify({})))).rejects.toThrow("缺少 postId")
  })

  it("2xx 但业务失败（success:false）必须抛错，不能静默成功", async () => {
    vi.stubGlobal("fetch", mockJson({ success: false, error: "登录已失效" }, true))
    await expect(dispatcher.upload(socialItem("LIKE", "CREATE", JSON.stringify({ postId: 1 })))).rejects.toThrow("登录已失效")
  })

  it("重定向到登录页视为失败（cookie 失效不能被当成成功）", async () => {
    const redirected = vi.fn(async () => ({ ok: true, status: 200, redirected: true, json: async () => ({ success: true }) })) as unknown as typeof fetch
    vi.stubGlobal("fetch", redirected)
    await expect(dispatcher.upload(socialItem("LIKE", "CREATE", JSON.stringify({ postId: 1 })))).rejects.toThrow("登录已失效")
  })
})
