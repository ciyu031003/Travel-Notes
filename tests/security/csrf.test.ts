import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import proxy from '../../proxy'

describe('proxy（原 middleware）CSRF 防护', () => {
  it('跨站 POST（Origin 与 Host 不一致）返回 403', async () => {
    const req = new NextRequest('http://example.com/api/admin/posts', {
      method: 'POST',
      headers: {
        origin: 'http://evil.com',
        host: 'example.com',
      },
    })
    const res = await proxy(req)
    expect(res.status).toBe(403)
  })

  it('同源 POST 不会被 CSRF 拦截（走后续鉴权）', async () => {
    const req = new NextRequest('http://example.com/api/admin/posts', {
      method: 'POST',
      headers: {
        origin: 'http://example.com',
        host: 'example.com',
      },
    })
    const res = await proxy(req)
    expect(res.status).not.toBe(403)
  })

  it('无 Origin 的非浏览器请求放行', async () => {
    const req = new NextRequest('http://example.com/api/admin/posts', {
      method: 'POST',
      headers: { host: 'example.com' },
    })
    const res = await proxy(req)
    expect(res.status).not.toBe(403)
  })
  it('生产模式下 App 壳预检（Origin=https://localhost）回显 ACAO + 凭据（P1-13 兼容）', async () => {
    try {
      vi.stubEnv('NODE_ENV', 'production')
      const req = new NextRequest('http://example.com/api/login', {
        method: 'OPTIONS',
        headers: { origin: 'https://localhost', host: 'example.com' },
      })
      const res = await proxy(req)
      expect(res.headers.get('access-control-allow-origin')).toBe('https://localhost')
      expect(res.headers.get('access-control-allow-credentials')).toBe('true')
      expect(res.headers.get('vary')).toMatch(/origin/i)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("Origin 为 'null' 且 Sec-Fetch-Site: cross-site 的写请求返回 403（P1-13）", async () => {
    const req = new NextRequest('http://example.com/api/social/posts', {
      method: 'POST',
      headers: {
        origin: 'null',
        'sec-fetch-site': 'cross-site',
        host: 'example.com',
      },
    })
    const res = await proxy(req)
    expect(res.status).toBe(403)
  })

  it("不可解析的 Origin + cross-site 同样 403", async () => {
    const req = new NextRequest('http://example.com/api/social/posts', {
      method: 'POST',
      headers: {
        origin: 'null',
        'sec-fetch-site': 'cross-site',
        host: 'example.com',
      },
    })
    expect((await proxy(req)).status).toBe(403)
  })

  it("Origin 为 'null' 但没有 cross-site 标记 → 放行（Capacitor WebView 兼容）", async () => {
    const req = new NextRequest('http://example.com/api/social/posts', {
      method: 'POST',
      headers: {
        origin: 'null',
        host: 'example.com',
      },
    })
    expect((await proxy(req)).status).not.toBe(403)
  })
})