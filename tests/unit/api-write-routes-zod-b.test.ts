import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * P1-17 收尾 B：travel / space / memory / social 写路由的 zod 校验回归。
 *
 * 每条路由覆盖「非法输入 → 400 + 稳定 code」与「合法输入 → 成功且响应形状不变」。
 * 统一错误格式由 lib/api/handler.ts（withAuth）与 lib/api/schemas/common.ts（withRouteErrors）产出：
 *   { success:false, error, code, requestId }
 */

const {
  requireAuthMock,
  prismaMock,
  addDayMock,
  addExpenseMock,
  getTravelExpensesMock,
  findTravelIdByExpenseIdMock,
  updateTravelInfoMock,
  canManageTravelMock,
  canActOnContentMock,
  canViewResourceByIdMock,
  guardTravelWriteMock,
  memoryServiceMock,
  reportPostMock,
  followUserMock,
  unfollowUserMock,
  spaceServiceMock,
  createInviteMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  prismaMock: {
    travel: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
  addDayMock: vi.fn(),
  addExpenseMock: vi.fn(),
  getTravelExpensesMock: vi.fn(),
  findTravelIdByExpenseIdMock: vi.fn(),
  updateTravelInfoMock: vi.fn(),
  canManageTravelMock: vi.fn(),
  canActOnContentMock: vi.fn(),
  canViewResourceByIdMock: vi.fn(),
  guardTravelWriteMock: vi.fn(),
  memoryServiceMock: {
    attachMedia: vi.fn(),
    detachMedia: vi.fn(),
    getMemory: vi.fn(),
    updateMemory: vi.fn(),
    deleteMemory: vi.fn(),
  },
  reportPostMock: vi.fn(),
  followUserMock: vi.fn(),
  unfollowUserMock: vi.fn(),
  spaceServiceMock: { createInvite: vi.fn(), listInvites: vi.fn() },
  createInviteMock: vi.fn(),
}))

vi.mock('@/lib/auth-middleware', () => ({ requireAuth: requireAuthMock }))
vi.mock('@/lib/db', () => ({ prisma: prismaMock }))
vi.mock('@/lib/current-user', () => ({ getCurrentUserId: vi.fn(async () => 1), getCurrentUser: vi.fn(async () => null) }))
vi.mock('@/lib/modules/travel/travel.service', () => ({
  addDay: addDayMock,
  addExpense: addExpenseMock,
  getTravelExpenses: getTravelExpensesMock,
  findTravelIdByExpenseId: findTravelIdByExpenseIdMock,
  updateTravelInfo: updateTravelInfoMock,
  canManageTravel: canManageTravelMock,
}))
vi.mock('@/lib/modules/access', () => ({
  canActOnContent: canActOnContentMock,
  canViewResourceById: canViewResourceByIdMock,
}))
vi.mock('@/lib/modules/travel/api-guard', () => ({ guardTravelWrite: guardTravelWriteMock }))
vi.mock('@/lib/modules/memory/memory.service', () => ({ memoryService: memoryServiceMock }))
vi.mock('@/lib/modules/social/social.service', () => ({
  reportPost: reportPostMock,
  followUser: followUserMock,
  unfollowUser: unfollowUserMock,
}))
vi.mock('@/lib/modules/space/space.service', () => ({
  spaceService: { ...spaceServiceMock, createInvite: createInviteMock },
}))

import { POST as daysPOST } from '@/app/api/travels/[id]/days/route'
import { POST as expensesPOST } from '@/app/api/travels/[id]/expenses/route'
import { POST as confirmPOST } from '@/app/api/travels/[id]/confirm/route'
import { PUT as bySlugPUT } from '@/app/api/travels/by-slug/[slug]/route'
import { POST as memoryMediaPOST } from '@/app/api/memories/[id]/media/route'
import { POST as reportPOST } from '@/app/api/social/posts/[id]/report/route'
import { POST as followPOST } from '@/app/api/social/users/[id]/follow/route'
import { POST as invitesPOST } from '@/app/api/spaces/[id]/invites/route'

function jsonRequest(url: string, body: unknown, method = 'POST'): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function rawRequest(url: string, rawBody: string, method = 'POST'): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: rawBody,
  })
}

const travelCtx = { params: Promise.resolve({ id: '7' }) }
const travelRecord = { id: 7, visibility: 'SPACE', isPublic: false, ownerId: 1, spaceId: null }

beforeEach(() => {
  vi.clearAllMocks()
  requireAuthMock.mockResolvedValue({
    authenticated: true,
    username: 'alice',
    payload: { userId: 1, username: 'alice' },
  })
  canActOnContentMock.mockResolvedValue(true)
  canViewResourceByIdMock.mockResolvedValue(true)
  canManageTravelMock.mockResolvedValue(true)
  guardTravelWriteMock.mockResolvedValue({
    ok: true,
    ctx: { username: 'alice', userId: 1, travel: { id: 7, spaceId: null, ownerId: 1, startDate: null, endDate: null } },
  })
  prismaMock.travel.findUnique.mockResolvedValue(travelRecord)
})

describe('POST /api/travels/[id]/days（zod body）', () => {
  it('非法日期 → 400 + VALIDATION_ERROR', async () => {
    const res = await daysPOST(jsonRequest('http://example.com/api/travels/7/days', { date: 'not-a-date' }), travelCtx)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION_ERROR')
    expect(addDayMock).not.toHaveBeenCalled()
  })

  it('标题超长 → 400 + VALIDATION_ERROR', async () => {
    const res = await daysPOST(jsonRequest('http://example.com/api/travels/7/days', { title: 'x'.repeat(61) }), travelCtx)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION_ERROR')
  })

  it('合法 body → 201 且成功响应保持 { success, id }', async () => {
    addDayMock.mockResolvedValue({ id: 55 })
    const res = await daysPOST(jsonRequest('http://example.com/api/travels/7/days', { title: '第一天', summary: '抵达' }), travelCtx)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ success: true, id: 55 })
    expect(addDayMock).toHaveBeenCalledWith(7, { date: undefined, title: '第一天', summary: '抵达' })
  })
})

describe('POST /api/travels/[id]/expenses（guard + zod body）', () => {
  it('金额为 0 → 400 + VALIDATION_ERROR', async () => {
    const res = await expensesPOST(jsonRequest('http://example.com/api/travels/7/expenses', { amount: 0 }), travelCtx)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION_ERROR')
    expect(addExpenseMock).not.toHaveBeenCalled()
  })

  it('金额非数字 → 400', async () => {
    const res = await expensesPOST(jsonRequest('http://example.com/api/travels/7/expenses', { amount: 'abc' }), travelCtx)
    expect(res.status).toBe(400)
  })

  it('合法金额（字符串元）→ 201', async () => {
    addExpenseMock.mockResolvedValue({ id: 9 })
    const res = await expensesPOST(
      jsonRequest('http://example.com/api/travels/7/expenses', { amount: '128.5', category: 'food', note: '午餐' }),
      travelCtx,
    )
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ success: true, id: 9 })
    expect(addExpenseMock).toHaveBeenCalledWith(7, expect.objectContaining({ amount: 128.5, note: '午餐' }))
  })
})

describe('POST /api/travels/[id]/confirm（无 body，仅路径 id）', () => {
  it('非法 id → 400 + INVALID_ID（never 进 guard）', async () => {
    const res = await confirmPOST(new NextRequest('http://example.com/api/travels/abc/confirm', { method: 'POST' }), {
      params: Promise.resolve({ id: 'abc' }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_ID')
    expect(guardTravelWriteMock).not.toHaveBeenCalled()
  })

  it('合法 id → 200 且首次归档写入 confirmedAt', async () => {
    prismaMock.travel.findUnique.mockResolvedValue({ confirmedAt: null })
    prismaMock.travel.update.mockResolvedValue({ id: 7 })
    const res = await confirmPOST(new NextRequest('http://example.com/api/travels/7/confirm', { method: 'POST' }), travelCtx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(typeof body.confirmedAt).toBe('string')
    expect(prismaMock.travel.update).toHaveBeenCalledOnce()
  })
})

describe('PUT /api/travels/by-slug/[slug]（zod body）', () => {
  it('空标题 → 400 + VALIDATION_ERROR', async () => {
    prismaMock.travel.findFirst.mockResolvedValue({ id: 3 })
    const res = await bySlugPUT(
      jsonRequest('http://example.com/api/travels/by-slug/nanjing', { title: '' }, 'PUT'),
      { params: Promise.resolve({ slug: 'nanjing' }) },
    )
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION_ERROR')
    expect(updateTravelInfoMock).not.toHaveBeenCalled()
  })

  it('负预算 → 400 + VALIDATION_ERROR', async () => {
    prismaMock.travel.findFirst.mockResolvedValue({ id: 3 })
    const res = await bySlugPUT(
      jsonRequest('http://example.com/api/travels/by-slug/nanjing', { budget: -1 }, 'PUT'),
      { params: Promise.resolve({ slug: 'nanjing' }) },
    )
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION_ERROR')
  })

  it('合法 body（字符串预算）→ 200 且 slug 回传不变', async () => {
    prismaMock.travel.findFirst.mockResolvedValue({ id: 3 })
    updateTravelInfoMock.mockResolvedValue({ slug: 'nanjing-2', daysChanged: 1 })
    const res = await bySlugPUT(
      jsonRequest('http://example.com/api/travels/by-slug/nanjing', { title: '南京之行', budget: '100' }, 'PUT'),
      { params: Promise.resolve({ slug: 'nanjing' }) },
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, slug: 'nanjing-2', daysChanged: 1 })
    expect(updateTravelInfoMock).toHaveBeenCalledWith(3, expect.objectContaining({ title: '南京之行', budget: 100 }))
  })
})

describe('POST /api/memories/[id]/media（mediaIds 数组校验）', () => {
  const ctx = { params: Promise.resolve({ id: '5' }) }

  it('空数组 → 400 + VALIDATION_ERROR', async () => {
    const res = await memoryMediaPOST(jsonRequest('http://example.com/api/memories/5/media', { mediaIds: [] }), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION_ERROR')
  })

  it('非数字 id → 400', async () => {
    const res = await memoryMediaPOST(jsonRequest('http://example.com/api/memories/5/media', { mediaIds: ['abc'] }), ctx)
    expect(res.status).toBe(400)
  })

  it('合法数组 → 200', async () => {
    memoryServiceMock.attachMedia.mockResolvedValue(undefined)
    const res = await memoryMediaPOST(jsonRequest('http://example.com/api/memories/5/media', { mediaIds: [1, 2] }), ctx)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(memoryServiceMock.attachMedia).toHaveBeenCalledWith('alice', 5, [1, 2])
  })
})

describe('POST /api/social/posts/[id]/report（reason 校验）', () => {
  const ctx = { params: Promise.resolve({ id: '11' }) }

  it('空白原因 → 400 + VALIDATION_ERROR', async () => {
    const res = await reportPOST(jsonRequest('http://example.com/api/social/posts/11/report', { reason: '   ' }), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION_ERROR')
    expect(reportPostMock).not.toHaveBeenCalled()
  })

  it('合法原因 → 200 且响应形状保持 { success, data }', async () => {
    reportPostMock.mockResolvedValue({ reported: true })
    const res = await reportPOST(jsonRequest('http://example.com/api/social/posts/11/report', { reason: '广告' }), ctx)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: { reported: true } })
    expect(reportPostMock).toHaveBeenCalledWith(11, 1, '广告')
  })
})

describe('POST /api/social/users/[id]/follow（无 body，仅路径 id）', () => {
  it('id 为 0 → 400 + INVALID_ID', async () => {
    const res = await followPOST(new NextRequest('http://example.com/api/social/users/0/follow', { method: 'POST' }), {
      params: Promise.resolve({ id: '0' }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_ID')
    expect(followUserMock).not.toHaveBeenCalled()
  })

  it('合法 id → 200', async () => {
    followUserMock.mockResolvedValue({ following: true })
    const res = await followPOST(new NextRequest('http://example.com/api/social/users/9/follow', { method: 'POST' }), {
      params: Promise.resolve({ id: '9' }),
    })
    expect(res.status).toBe(200)
    expect(followUserMock).toHaveBeenCalledWith(1, 9)
  })
})

describe('POST /api/spaces/[id]/invites（zod + 原归一语义）', () => {
  const ctx = { params: Promise.resolve({ id: '4' }) }

  it('非法 JSON → 400 + INVALID_JSON（不再 500）', async () => {
    const res = await invitesPOST(rawRequest('http://example.com/api/spaces/4/invites', '{bad json'), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_JSON')
  })

  it('非法角色回落 MEMBER、超长有效期夹到 30（保持原业务语义）', async () => {
    createInviteMock.mockResolvedValue({ id: 1, code: 'ABCD-1234', role: 'MEMBER' })
    const res = await invitesPOST(
      jsonRequest('http://example.com/api/spaces/4/invites', { role: 'BOSS', expiresInDays: 999 }),
      ctx,
    )
    expect(res.status).toBe(201)
    expect(createInviteMock).toHaveBeenCalledWith('alice', 4, 'MEMBER', 30)
  })

  it('合法 body → 201 且返回邀请码', async () => {
    createInviteMock.mockResolvedValue({ id: 2, code: 'WXYZ-5678', role: 'VIEWER' })
    const res = await invitesPOST(
      jsonRequest('http://example.com/api/spaces/4/invites', { role: 'VIEWER', expiresInDays: 7 }),
      ctx,
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.code).toBe('WXYZ-5678')
  })
})
