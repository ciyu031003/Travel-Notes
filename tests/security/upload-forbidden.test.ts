import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * P0-4 路由层：归属校验失败必须映射为 403（上传）/ 404（删除），且不泄露存在性。
 * 服务层的判权逻辑见 tests/security/image-access-control.test.ts。
 */

const { uploadMock, deleteMock, ownerMock, requireAuthMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  deleteMock: vi.fn(),
  ownerMock: vi.fn(),
  requireAuthMock: vi.fn(),
}))

vi.mock('@/lib/auth-middleware', () => ({ requireAuth: requireAuthMock }))
vi.mock('@/lib/container', () => ({
  getImageService: () => ({ upload: uploadMock, delete: deleteMock }),
}))
vi.mock('@/lib/site-owner', () => ({ isSiteOwner: ownerMock, getSiteOwnerId: vi.fn() }))
vi.mock('@/lib/infrastructure/rate-limit-factory', () => ({
  rateLimitShared: vi.fn(async () => ({ ok: true, used: 1, remaining: 119, retryAfterSeconds: 60 })),
}))
vi.mock('@/lib/request-utils', () => ({ getClientIp: vi.fn(() => '1.2.3.4') }))
vi.mock('@/lib/modules/audit/audit-log.service', () => ({ writeAuditLog: vi.fn(async () => {}) }))

import { MediaAccessError } from '@/lib/services/image-service'
import { POST, DELETE } from '@/app/api/upload/route'

function uploadRequest() {
  const form = new FormData()
  form.append('files', new File([Buffer.from('fake')], 'a.jpg', { type: 'image/jpeg' }))
  form.append('postId', '3')
  return new NextRequest('http://localhost/api/upload', { method: 'POST', body: form })
}

function deleteRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/upload', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuthMock.mockResolvedValue({ authenticated: true, username: 'u1', payload: { userId: 7 } })
  ownerMock.mockResolvedValue(false)
  uploadMock.mockResolvedValue({ urls: ['/api/images/11'] })
  deleteMock.mockResolvedValue(undefined)
})

describe('POST /api/upload 归属校验（S-4）', () => {
  it('上传到他人文章 → 403，且 actor 身份透传到服务层', async () => {
    uploadMock.mockRejectedValue(new MediaAccessError('文章不存在或无权限'))

    const res = await POST(uploadRequest())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.code).toBe('FORBIDDEN')
    // 不泄露存在性：文案与「文章不存在」一致
    expect(body.error).not.toMatch(/不属于|他人的文章/)
    expect(uploadMock.mock.calls[0][2]).toEqual({ userId: 7, isSiteOwner: false })
  })

  it('本人文章 → 正常返回 urls', async () => {
    const res = await POST(uploadRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ urls: ['/api/images/11'] })
  })
})

describe('DELETE /api/upload 归属校验（S-4）', () => {
  it('删他人图片 → 404（无权与不存在同响应）', async () => {
    deleteMock.mockRejectedValue(new MediaAccessError('图片不存在或无权限'))

    const res = await DELETE(deleteRequest({ url: '/api/images/5' }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('NOT_FOUND')
    expect(body.error).toBe('图片不存在')
    expect(deleteMock.mock.calls[0][1]).toEqual({ userId: 7, isSiteOwner: false })
  })
})
