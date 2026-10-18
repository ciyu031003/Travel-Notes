import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * P0-6：REGISTRATION_ENABLED='false' 时注册端点必须 403（止血开关）。
 */
const { registerMock } = vi.hoisted(() => ({ registerMock: vi.fn() }))

vi.mock('@/lib/container', () => ({ getAuthService: () => ({ register: registerMock }) }))
vi.mock('@/lib/infrastructure/rate-limit', () => ({ rateLimit: () => ({ ok: true }) }))

import { POST } from '@/app/api/register/route'

function registerRequest() {
  return new NextRequest('http://example.com/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'bob', password: 'Str0ng#Passw0rd', rememberMe: false, clientType: 'web' }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.REGISTRATION_ENABLED
  registerMock.mockResolvedValue({ success: false, error: '该用户名已被注册' })
})

afterEach(() => {
  delete process.env.REGISTRATION_ENABLED
})

describe('注册开关（P0-6）', () => {
  it("REGISTRATION_ENABLED='false' → 403 {error:'注册暂未开放'}，不调用 register", async () => {
    process.env.REGISTRATION_ENABLED = 'false'
    const res = await POST(registerRequest())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('注册暂未开放')
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('未配置（默认开启）→ 正常走注册逻辑', async () => {
    const res = await POST(registerRequest())
    expect(res.status).not.toBe(403)
    expect(registerMock).toHaveBeenCalledTimes(1)
  })

  it("显式 'true' 也视为开启", async () => {
    process.env.REGISTRATION_ENABLED = 'true'
    const res = await POST(registerRequest())
    expect(res.status).not.toBe(403)
    expect(registerMock).toHaveBeenCalledTimes(1)
  })
})
