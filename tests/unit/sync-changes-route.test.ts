import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * B4：GET /api/sync/changes（增量同步端点）。
 *
 * 契约：
 *  · 必须登录（401）；
 *  · updatedSince 支持 ISO 与毫秒时间戳，非法/未来时间 → 400 INVALID_QUERY；
 *  · 四类实体都按 updatedAt > since 过滤、按用户可见性裁剪、每类 limit 500；
 *  · tombstones 只返回当前用户、since 之后的、四种受支持实体；
 *  · serverTime 在查询前取（ISO），响应不缓存。
 */
const { requireAuthMock, prismaMock, spaceScopeMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  prismaMock: {
    travel: { findMany: vi.fn() },
    moment: { findMany: vi.fn() },
    album: { findMany: vi.fn() },
    memory: { findMany: vi.fn() },
    syncTombstone: { findMany: vi.fn() },
  },
  spaceScopeMock: {
    myActiveSpaceIds: vi.fn(),
    spaceScopedWhere: vi.fn(),
  },
}))

vi.mock('@/lib/auth-middleware', () => ({ requireAuth: requireAuthMock }))
vi.mock('@/lib/db', () => ({ prisma: prismaMock }))
vi.mock('@/lib/modules/access/space-scope', () => ({
  myActiveSpaceIds: spaceScopeMock.myActiveSpaceIds,
  spaceScopedWhere: spaceScopeMock.spaceScopedWhere,
}))

import { GET } from '@/app/api/sync/changes/route'

function request(url = 'http://example.com/api/sync/changes') {
  return new NextRequest(url)
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuthMock.mockResolvedValue({
    authenticated: true,
    username: 'alice',
    payload: { userId: 1, username: 'alice' },
  })
  spaceScopeMock.myActiveSpaceIds.mockResolvedValue([10])
  spaceScopeMock.spaceScopedWhere.mockImplementation(
    (userId: number, ownerField: string, spaceIds: number[]) => ({
      OR: [{ [ownerField]: userId }, { isPublic: true }, { spaceId: { in: spaceIds } }],
    }),
  )
  prismaMock.travel.findMany.mockResolvedValue([{ id: 1, title: 't', updatedAt: new Date('2026-01-02T00:00:00Z') }])
  prismaMock.moment.findMany.mockResolvedValue([
    { id: 2, content: 'c', tags: '["旅行"]', updatedAt: new Date('2026-01-02T00:00:00Z') },
  ])
  prismaMock.album.findMany.mockResolvedValue([{ id: 3, title: 'a', updatedAt: new Date('2026-01-02T00:00:00Z') }])
  prismaMock.memory.findMany.mockResolvedValue([{ id: 4, title: 'm', updatedAt: new Date('2026-01-02T00:00:00Z') }])
  prismaMock.syncTombstone.findMany.mockResolvedValue([
    { entityType: 'Travel', entityId: 9, deletedAt: new Date('2026-01-02T00:00:00Z') },
  ])
})

describe('GET /api/sync/changes', () => {
  it('未登录 → 401', async () => {
    requireAuthMock.mockResolvedValue({ authenticated: false })
    const res = await GET(request())
    expect(res.status).toBe(401)
  })

  it('updatedSince 非法 → 400 INVALID_QUERY', async () => {
    const res = await GET(request('http://example.com/api/sync/changes?updatedSince=not-a-date'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_QUERY')
    expect(prismaMock.travel.findMany).not.toHaveBeenCalled()
  })

  it('updatedSince 为未来时间 → 400', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const res = await GET(request('http://example.com/api/sync/changes?updatedSince=' + encodeURIComponent(future)))
    expect(res.status).toBe(400)
  })

  it('ISO 游标 → 四类实体按 updatedAt > since 过滤、limit 500、按可见性裁剪', async () => {
    const since = '2026-01-01T00:00:00.000Z'
    const res = await GET(request('http://example.com/api/sync/changes?updatedSince=' + encodeURIComponent(since)))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body).toHaveProperty('serverTime')
    expect(Number.isNaN(new Date(body.serverTime).getTime())).toBe(false)
    expect(body.travels).toHaveLength(1)
    expect(body.moments[0].tags).toEqual(['旅行']) // Text JSON → 数组
    expect(body.albums).toHaveLength(1)
    expect(body.memories).toHaveLength(1)
    expect(body.tombstones).toEqual([
      { entityType: 'Travel', entityId: 9, deletedAt: body.tombstones[0].deletedAt },
    ])
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const sinceDate = new Date(since)
    for (const model of [prismaMock.travel, prismaMock.moment, prismaMock.album, prismaMock.memory]) {
      const args = model.findMany.mock.calls[0][0]
      expect(args.take).toBe(500)
      expect(args.orderBy).toEqual({ updatedAt: 'asc' })
      expect(args.where.updatedAt.gt.getTime()).toBe(sinceDate.getTime())
    }
    // 可见性裁剪确实进了 where（travel/album 走 spaceScopedWhere，moment 走 scopedWhere，memory 走 OR）
    expect(prismaMock.travel.findMany.mock.calls[0][0].where.OR).toBeTruthy()
    expect(prismaMock.moment.findMany.mock.calls[0][0].where.OR).toEqual([{ userId: 1 }, { isPublic: true }])
    expect(prismaMock.memory.findMany.mock.calls[0][0].where.OR).toEqual([
      { createdById: 1 },
      { visibility: 'PUBLIC' },
      { visibility: 'SPACE', spaceId: { in: [10] } },
    ])

    const tbArgs = prismaMock.syncTombstone.findMany.mock.calls[0][0]
    expect(tbArgs.where.userId).toBe(1)
    expect(tbArgs.where.deletedAt.gt.getTime()).toBe(sinceDate.getTime())
    expect(tbArgs.where.entityType.in).toEqual(['Travel', 'Moment', 'Album', 'Memory'])
  })

  it('毫秒时间戳游标（客户端实际格式）同样被接受', async () => {
    const ms = new Date('2026-01-01T00:00:00.000Z').getTime()
    const res = await GET(request('http://example.com/api/sync/changes?updatedSince=' + ms))
    expect(res.status).toBe(200)
    expect(prismaMock.travel.findMany.mock.calls[0][0].where.updatedAt.gt.getTime()).toBe(ms)
  })
})
