import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth-middleware', () => ({
  requireAuth: vi.fn(),
}))

vi.mock('@/lib/container', () => ({
  getImageService: vi.fn(() => ({ upload: vi.fn(), delete: vi.fn() })),
}))

vi.mock('@/lib/modules/audit/audit-log.service', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '@/lib/auth-middleware'
import { POST, DELETE } from '@/app/api/upload/route'

async function makeRequest(method: string, body?: BodyInit | null): Promise<NextRequest> {
  return new NextRequest('http://localhost/api/upload', { method, body })
}

function emptyMultipartRequest(): NextRequest {
  const form = new FormData()
  return new NextRequest('http://localhost/api/upload', { method: 'POST', body: form })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/upload 认证保护', () => {
  it('未登录返回 401', async () => {
    ;(requireAuth as any).mockResolvedValue({ authenticated: false })
    const res = await POST(await makeRequest('POST'))
    expect(res.status).toBe(401)
  })

  it('已登录但未上传文件返回 400', async () => {
    ;(requireAuth as any).mockResolvedValue({ authenticated: true, username: 'admin' })
    const res = await POST(emptyMultipartRequest())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('未上传任何文件')
  })
})

describe('DELETE /api/upload 认证保护', () => {
  it('未登录返回 401', async () => {
    ;(requireAuth as any).mockResolvedValue({ authenticated: false })
    const res = await DELETE(await makeRequest('DELETE'))
    expect(res.status).toBe(401)
  })
})
