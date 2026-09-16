import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiFetch, ApiError, __resetClientCache } from '@/lib/client/api'

/**
 * apiFetch 的「受保护接口被重定向到登录页」行为回归测试。
 *
 * 背景（真机复现的 bug）：中间件对受保护接口返回 **307 → /login?redirect=...**，
 * 而不是 401。旧的 apiFetch 直接 `fetch(path)`，浏览器跟随重定向拿到登录页 HTML：
 *   · `res.ok === true`（登录页是 200）→ 不进 `!res.ok` 分支
 *   · `JSON.parse(html)` 失败 → `json = null` → `extractError(null)` 为 null
 *   · 于是 resolve(null)：**既不报错、也没有数据**
 * 消费方 `useApi` 得到 `data=null, error='' ，loading=false`，
 * 页面条件 `loading || !profile` 恒真 → 停在「正在加载你的旅行档案…」转圈。
 *
 * 修复后：不再跟随重定向；一旦发现被重定向即抛 401 ApiError，让消费方走错误/登录引导分支。
 */

const originalFetch = globalThis.fetch

function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch
}

afterEach(() => {
  globalThis.fetch = originalFetch
  __resetClientCache()
})

beforeEach(() => {
  __resetClientCache()
})

describe('apiFetch 对重定向的处理', () => {
  it('不跟随重定向：请求使用 redirect: "manual"', async () => {
    let seenRedirect: RequestRedirect | undefined
    mockFetch(async (_input, init) => {
      seenRedirect = init?.redirect
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    await apiFetch('/api/me')
    expect(seenRedirect, '必须显式传 redirect: "manual"，否则 307 会被跟随到登录页').toBe('manual')
  })

  it('遇到 307（opaque redirect，status 0）抛 401，而不是静默返回 null', async () => {
    // redirect:'manual' 下跨源重定向不可读，浏览器给出 type='opaqueredirect' 且 status 0；
    // 同源重定向则可能直接给出 307。两种都要判。
    mockFetch(async () => new Response(null, { status: 307 }))

    await expect(apiFetch('/api/me')).rejects.toMatchObject({ status: 401 })
  })

  it('status 0 / opaqueredirect 也抛 401', async () => {
    mockFetch(async () => {
      const r = new Response(null, { status: 200 })
      Object.defineProperty(r, 'status', { value: 0 })
      Object.defineProperty(r, 'type', { value: 'opaqueredirect' })
      return r
    })

    const err = await apiFetch('/api/me').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(401)
  })

  it('正常 200 JSON 不受影响（含 ok() 包装解包）', async () => {
    mockFetch(async () => new Response(JSON.stringify({ success: true, data: { id: 1 } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    expect(await apiFetch('/api/me')).toEqual({ id: 1 })
  })

  it('真实 401 仍然抛 401（语义不变）', async () => {
    mockFetch(async () => new Response(JSON.stringify({ error: '请先登录' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    }))
    const err = await apiFetch('/api/me').catch((e) => e)
    expect((err as ApiError).status).toBe(401)
    expect((err as ApiError).message).toBe('请先登录')
  })

  it('服务端 500 抛 500（不被误判成登录问题）', async () => {
    mockFetch(async () => new Response(JSON.stringify({ error: '服务器错误' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    }))
    const err = await apiFetch('/api/me').catch((e) => e)
    expect((err as ApiError).status).toBe(500)
  })
})
