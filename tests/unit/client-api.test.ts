import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiFetch, ApiError, __resetClientCache } from '@/lib/client/api'

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

describe('apiFetch（阶段 A · A2 统一取数层）', () => {
  beforeEach(() => __resetClientCache())

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('兼容 ok() 包装：{ success: true, data } 自动解包 data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { posts: [1] } })))
    const out = await apiFetch<any>('/api/x')
    expect(out.posts).toEqual([1])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('直接对象响应原样返回', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ years: [2026] })))
    const out = await apiFetch<any>('/api/y')
    expect(out.years).toEqual([2026])
  })

  it('HTTP 非 2xx：抛出 ApiError 并携带业务 error 文案', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: '服务器内部错误' }, 500)))
    await expect(apiFetch('/api/e')).rejects.toMatchObject({ name: 'ApiError', status: 500, message: '服务器内部错误' })
  })

  it('200 但带 error 字段：视为业务错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: false, error: '未授权' }, 200)))
    await expect(apiFetch('/api/e2')).rejects.toBeInstanceOf(ApiError)
  })

  it('并发去重：同一 path 并发请求只发一次网络请求', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, data: 1 })))
    const [a, b, c] = await Promise.all([apiFetch('/api/dedup'), apiFetch('/api/dedup'), apiFetch('/api/dedup')])
    expect(a).toBe(1)
    expect(b).toBe(1)
    expect(c).toBe(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('TTL 缓存：TTL 内重复请求不再发网络请求', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, data: 'v1' })))
    const first = await apiFetch('/api/ttl', { ttlMs: 5000 })
    const second = await apiFetch('/api/ttl', { ttlMs: 5000 })
    expect(first).toBe('v1')
    expect(second).toBe('v1')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('TTL 过期后重新请求', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, data: 'v1' })))
    await apiFetch('/api/exp', { ttlMs: 1 })
    await new Promise((r) => setTimeout(r, 5))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, data: 'v2' })))
    const out = await apiFetch('/api/exp', { ttlMs: 5000 })
    expect(out).toBe('v2')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('携带凭据与 signal 透传', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    const ctrl = new AbortController()
    await apiFetch('/api/sig', { signal: ctrl.signal })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.credentials).toBe('include')
    expect(init.signal).toBe(ctrl.signal)
  })
})
