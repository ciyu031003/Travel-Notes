import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../../middleware'

describe('middleware CSRF 防护', () => {
  it('跨站 POST（Origin 与 Host 不一致）返回 403', async () => {
    const req = new NextRequest('http://example.com/api/admin/posts', {
      method: 'POST',
      headers: {
        origin: 'http://evil.com',
        host: 'example.com',
      },
    })
    const res = await middleware(req)
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
    const res = await middleware(req)
    expect(res.status).not.toBe(403)
  })

  it('无 Origin 的非浏览器请求放行', async () => {
    const req = new NextRequest('http://example.com/api/admin/posts', {
      method: 'POST',
      headers: { host: 'example.com' },
    })
    const res = await middleware(req)
    expect(res.status).not.toBe(403)
  })
})
