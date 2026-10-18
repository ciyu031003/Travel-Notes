import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * P1-17 收尾：代表性写路由的 zod 校验回归。
 * 每条路由覆盖「非法 body → 400 + code=VALIDATION_ERROR」与「合法 body → 成功」。
 */
const {
  requireAuthMock,
  requireCapabilityMock,
  getMarkdownRendererMock,
  getMomentServiceMock,
  getLikeServiceMock,
  getAuthServiceMock,
  prismaMock,
  getCurrentUserIdMock,
  getMyProfileMock,
  updateMyCoverFocusMock,
  createMomentMock,
  toggleMock,
  verifyResetCodeMock,
  canManageTravelMock,
  addExpenseMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  requireCapabilityMock: vi.fn(),
  getMarkdownRendererMock: vi.fn(),
  getMomentServiceMock: vi.fn(),
  getLikeServiceMock: vi.fn(),
  getAuthServiceMock: vi.fn(),
  prismaMock: { danmaku: { create: vi.fn(), findMany: vi.fn(), delete: vi.fn() } },
  getCurrentUserIdMock: vi.fn(),
  getMyProfileMock: vi.fn(),
  updateMyCoverFocusMock: vi.fn(),
  createMomentMock: vi.fn(),
  toggleMock: vi.fn(),
  verifyResetCodeMock: vi.fn(),
  canManageTravelMock: vi.fn(),
  addExpenseMock: vi.fn(),
}))

vi.mock('@/lib/auth-middleware', () => ({ requireAuth: requireAuthMock }))
vi.mock('@/lib/capability-guard', () => ({ requireCapability: requireCapabilityMock }))
vi.mock('@/lib/container', () => ({
  getMarkdownRenderer: getMarkdownRendererMock,
  getMomentService: getMomentServiceMock,
  getLikeService: getLikeServiceMock,
  getAuthService: getAuthServiceMock,
}))
vi.mock('@/lib/db', () => ({ prisma: prismaMock }))
vi.mock('@/lib/current-user', () => ({ getCurrentUserId: getCurrentUserIdMock }))
vi.mock('@/lib/modules/social/profile.service', () => ({
  getMyProfile: getMyProfileMock,
  updateMyCoverFocus: updateMyCoverFocusMock,
  updateMyCover: vi.fn(),
  updateMyAvatar: vi.fn(),
}))
vi.mock('@/lib/modules/travel/travel.service', () => ({
  canManageTravel: canManageTravelMock,
  addExpense: addExpenseMock,
}))
vi.mock('@/lib/infrastructure/rate-limit', () => ({ rateLimit: () => ({ ok: true }) }))
vi.mock('sharp', () => ({ default: vi.fn() }))

import { POST as previewPOST } from '@/app/api/admin/preview/route'
import { POST as danmakuPOST } from '@/app/api/danmaku/route'
import { POST as likesPOST } from '@/app/api/likes/route'
import { PUT as coverPUT } from '@/app/api/me/cover/route'
import { POST as verifyCodePOST } from '@/app/api/forgot-password/verify-code/route'
import { POST as expensesPOST } from '@/app/api/admin/travels/[id]/expenses/route'
import { POST as momentsPOST } from '@/app/api/admin/moments/route'

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuthMock.mockResolvedValue({ authenticated: true, username: 'alice', payload: { userId: 1, username: 'alice' } })
  requireCapabilityMock.mockResolvedValue(null)
  getCurrentUserIdMock.mockResolvedValue(1)
  canManageTravelMock.mockResolvedValue(true)
})

describe('admin/preview POST', () => {
  it('缺少 content → 400 + VALIDATION_ERROR', async () => {
    const res = await previewPOST(jsonRequest('http://example.com/api/admin/preview', {}))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION_ERROR')
  })

  it('合法 content → 200 且返回渲染结果', async () => {
    getMarkdownRendererMock.mockReturnValue({ render: vi.fn().mockResolvedValue({ html: '<p>hi</p>', toc: [] }) })
    const res = await previewPOST(jsonRequest('http://example.com/api/admin/preview', { content: '# 标题' }))
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
  })
})

describe('danmaku POST', () => {
  it('空内容 / 超长 → 400', async () => {
    expect((await danmakuPOST(jsonRequest('http://example.com/api/danmaku', { text: '   ' }))).status).toBe(400)
    expect((await danmakuPOST(jsonRequest('http://example.com/api/danmaku', { text: 'x'.repeat(51) }))).status).toBe(400)
  })

  it('合法内容 → 200 并落库', async () => {
    prismaMock.danmaku.create.mockResolvedValue({ id: 1, text: '你好', color: '#E4B478', createdAt: new Date() })
    const res = await danmakuPOST(jsonRequest('http://example.com/api/danmaku', { text: '你好' }))
    expect(res.status).toBe(200)
    expect(prismaMock.danmaku.create).toHaveBeenCalledOnce()
  })
})

describe('likes POST', () => {
  it('缺 visitorId / 非法 targetType → 400 + VALIDATION_ERROR', async () => {
    const res = await likesPOST(jsonRequest('http://example.com/api/likes', { targetType: 'post', targetId: '1' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION_ERROR')
    const res2 = await likesPOST(jsonRequest('http://example.com/api/likes', { targetType: 'bad', targetId: '1', visitorId: 'v' }))
    expect(res2.status).toBe(400)
  })

  it('合法参数 → 200', async () => {
    getLikeServiceMock.mockReturnValue({ toggle: toggleMock.mockResolvedValue({ liked: true, count: 1 }) })
    const res = await likesPOST(jsonRequest('http://example.com/api/likes', { targetType: 'post', targetId: 12, visitorId: 'visitor-1' }))
    expect(res.status).toBe(200)
    expect(toggleMock).toHaveBeenCalledWith('post', '12', 'visitor-1')
  })
})

describe('me/cover PUT（焦点）', () => {
  it('半套焦点 / 越界 → 400 + VALIDATION_ERROR', async () => {
    const req = (body: unknown) => new NextRequest('http://example.com/api/me/cover', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    expect((await coverPUT(req({ focusX: 0.5 }))).status).toBe(400)
    expect((await coverPUT(req({ focusX: 1.5, focusY: 0.5 }))).status).toBe(400)
  })

  it('合法焦点 → 200', async () => {
    getMyProfileMock.mockResolvedValue({ coverUrl: '/uploads/covers/a.webp' })
    updateMyCoverFocusMock.mockResolvedValue({ coverFocusX: 0.2, coverFocusY: 0.3 })
    const res = await coverPUT(new NextRequest('http://example.com/api/me/cover', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ focusX: 0.2, focusY: 0.3 }),
    }))
    expect(res.status).toBe(200)
  })
})

describe('forgot-password/verify-code POST', () => {
  it('邮箱格式错误 / 验证码非 6 位 → 400 + VALIDATION_ERROR', async () => {
    const res = await verifyCodePOST(jsonRequest('http://example.com/api/forgot-password/verify-code', { email: 'bad', code: '123' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION_ERROR')
  })

  it('合法参数 → 200', async () => {
    getAuthServiceMock.mockReturnValue({ verifyResetCode: verifyResetCodeMock.mockResolvedValue({ success: true }) })
    const res = await verifyCodePOST(jsonRequest('http://example.com/api/forgot-password/verify-code', { email: 'a@b.com', code: '123456' }))
    expect(res.status).toBe(200)
  })
})

describe('admin/travels/[id]/expenses POST', () => {
  const ctx = { params: Promise.resolve({ id: '7' }) }
  it('金额缺失/非正 → 400 + VALIDATION_ERROR', async () => {
    const res = await expensesPOST(jsonRequest('http://example.com/api/admin/travels/7/expenses', { amount: 0 }), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION_ERROR')
  })

  it('合法金额 → 201', async () => {
    addExpenseMock.mockResolvedValue({ id: 9 })
    const res = await expensesPOST(jsonRequest('http://example.com/api/admin/travels/7/expenses', { amount: '128.5', note: '午餐' }), ctx)
    expect(res.status).toBe(201)
    expect(addExpenseMock).toHaveBeenCalledOnce()
  })
})

describe('admin/moments POST', () => {
  it('空内容 → 400 + VALIDATION_ERROR', async () => {
    const res = await momentsPOST(jsonRequest('http://example.com/api/admin/moments', { content: '  ' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION_ERROR')
  })

  it('合法内容 → 200', async () => {
    getMomentServiceMock.mockReturnValue({ createMoment: createMomentMock.mockResolvedValue({ id: 3 }) })
    const res = await momentsPOST(jsonRequest('http://example.com/api/admin/moments', { content: '今天很开心', tags: ['旅行'] }))
    expect(res.status).toBe(200)
    expect(createMomentMock).toHaveBeenCalledOnce()
  })
})
