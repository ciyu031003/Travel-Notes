import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * P3 · POST /api/travels/[id]/publish（发布 / 取消发布到旅行圈）。
 *
 * 这是唯一"面向用户的公开开关"，契约：
 *   · withAuth + 作者(ownerId) / 空间 OWNER 才能改；
 *   · 复用 travelService.updateTravel（同一条写路径 → visibility + TravelPost 投影 + 缓存失效）；
 *   · 返回 { visibility, published }，其中 published 以「TravelPost 是否真的存在」为准；
 *   · 取消发布（visibility=SPACE）必须把 TravelPost 删掉（旅行圈里消失）。
 *
 * 做法：把 withAuth 降级为直通（只测业务体），updateTravel mock 成"真的写可见性 + 同步投影"，
 * 这样既断言了路由的鉴权分支，也验证了投影语义（PUBLIC→建帖 / SPACE→删帖）是真实的。
 */

const box = vi.hoisted(() => {
  const state = {
    travel: {
      id: 55,
      spaceId: 1 as number | null,
      ownerId: 7 as number | null,
      visibility: 'SPACE',
      isPublic: false,
    },
    posts: new Map<number, { id: number }>(),
  }
  return {
    state,
    travel: { findUnique: vi.fn() },
    travelPost: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    updateTravel: vi.fn(),
    requireSpaceRole: vi.fn(),
    syncTravelPost: vi.fn(),
    syncMemoryVisibility: vi.fn(),
    SpaceAccessError: class SpaceAccessError extends Error {},
  }
})

vi.mock('@/lib/db', () => ({ prisma: { travel: box.travel, travelPost: box.travelPost } }))
vi.mock('@/lib/modules/social/feed-cache', () => ({
  SOCIAL_FEED_CACHE_TAG: 'social-feed',
  SOCIAL_FEED_CACHE_TTL_SECONDS: 60,
  getSocialFeedCache: () => ({ get: vi.fn(async () => null), set: vi.fn(async () => {}), deleteByTag: vi.fn(async () => {}) }),
  invalidateSocialFeedCache: vi.fn(async () => {}),
}))
vi.mock('@/lib/modules/social/travel-post.service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, syncTravelPost: box.syncTravelPost }
})
vi.mock('@/lib/modules/travel/space-travel.service', () => ({
  travelService: { updateTravel: box.updateTravel },
}))
vi.mock('@/lib/modules/space/permissions', () => ({
  SpaceAccessError: box.SpaceAccessError,
  requireSpaceRole: box.requireSpaceRole,
  requireSpaceMember: vi.fn(),
}))
// 计划生成的回忆同步：路由层只验接线（真实逻辑在 space-plan-convert.test.ts 覆盖）
vi.mock('@/lib/modules/space/space-plan.service', () => ({
  syncConvertedTravelMemoryVisibility: box.syncMemoryVisibility,
}))
// 只把 withAuth 降级为直通（parseBody / ApiError 等保留真实实现）
vi.mock('@/lib/api/handler', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, withAuth: (handler: unknown) => handler }
})

import { POST } from '@/app/api/travels/[id]/publish/route'
import { ApiError } from '@/lib/api-response'

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    auth: { authenticated: true, username: 'alice' },
    requestId: 'test-req',
    userId: 7,
    username: 'alice',
    ...overrides,
  }
}

function request(body?: unknown, travelId = 55) {
  return new Request('http://localhost/api/travels/' + travelId + '/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function routeCtx(travelId = 55) {
  return { params: Promise.resolve({ id: String(travelId) }) }
}

/** withAuth 被降级成直通后，POST 实际是「(request, ctx, routeContext)」三参处理器；这里按真实形状调用 */
const postHandler = POST as unknown as (
  request: Request,
  userCtx: ReturnType<typeof ctx>,
  routeContext: { params: Promise<{ id: string }> },
) => Promise<Response>

async function callPost(body: unknown, userCtx = ctx(), travelId = 55) {
  return postHandler(request(body, travelId), userCtx, routeCtx(travelId))
}

beforeEach(() => {
  vi.clearAllMocks()
  box.state.travel = { id: 55, spaceId: 1, ownerId: 7, visibility: 'SPACE', isPublic: false }
  box.state.posts.clear()

  // 旅行读取：返回内存里的当前行（updateTravel 会改它）
  box.travel.findUnique.mockImplementation(async () => ({ ...box.state.travel }))
  // 复用真实写路径的最小镜像：改 visibility/isPublic → 同步 TravelPost 投影
  box.updateTravel.mockImplementation(async (_username: string, travelId: number, patch: any) => {
    box.state.travel.visibility = patch.visibility
    box.state.travel.isPublic = patch.visibility === 'PUBLIC'
    await box.syncTravelPost(travelId)
    return { id: travelId }
  })
  box.syncTravelPost.mockImplementation(async (travelId: number) => {
    const travel = await box.travel.findUnique({ where: { id: travelId } })
    if (travel.visibility !== 'PUBLIC' && !travel.isPublic) {
      box.state.posts.delete(travelId)
      await box.travelPost.deleteMany({ where: { travelId } })
      return null
    }
    const post = { id: 900 }
    box.state.posts.set(travelId, post)
    await box.travelPost.create({ data: { travelId } })
    return { id: post.id, published: true }
  })
  // 路由末尾按「投影是否真实存在」回显
  box.travelPost.findUnique.mockImplementation(async (args: any) => box.state.posts.get(args?.where?.travelId) ?? null)
  box.travelPost.create.mockImplementation(async (args: any) => {
    const post = { id: 900 }
    box.state.posts.set(args?.data?.travelId, post)
    return post
  })
  box.travelPost.deleteMany.mockResolvedValue({ count: 1 })
  box.requireSpaceRole.mockResolvedValue({ spaceId: 1, role: 'OWNER', isOwner: true })
  box.syncMemoryVisibility.mockResolvedValue(0)
})

describe('POST /api/travels/[id]/publish', () => {
  it('作者公开到旅行圈：调用 updateTravel(PUBLIC)，返回 published:true', async () => {
    const response = await callPost({ visibility: 'PUBLIC' })
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json).toMatchObject({ success: true, visibility: 'PUBLIC', published: true })
    expect(box.updateTravel).toHaveBeenCalledWith('alice', 55, { visibility: 'PUBLIC' })
    expect(box.state.posts.has(55)).toBe(true)
    // 计划生成的回忆跟旅行同档公开（只动计划这批，见 service 单测）
    expect(box.syncMemoryVisibility).toHaveBeenCalledWith(55, 'PUBLIC')
  })

  it('作者取消公开（SPACE）：TravelPost 被删除，返回 published:false', async () => {
    box.state.posts.set(55, { id: 900 })

    const response = await callPost({ visibility: 'SPACE' })
    const json = await response.json()
    expect(json).toMatchObject({ visibility: 'SPACE', published: false })
    expect(box.updateTravel).toHaveBeenCalledWith('alice', 55, { visibility: 'SPACE' })
    expect(box.travelPost.deleteMany).toHaveBeenCalledWith({ where: { travelId: 55 } })
    expect(box.state.posts.has(55)).toBe(false)
    // 取消公开 → 计划生成的回忆一并回落
    expect(box.syncMemoryVisibility).toHaveBeenCalledWith(55, 'SPACE')
  })

  it('非作者但空间 OWNER：允许（空间兜底，避免成员退出后没人能管）', async () => {
    const response = await callPost({ visibility: 'PUBLIC' }, ctx({ userId: 99, username: 'owner' }))
    expect(response.status).toBe(200)
    expect(box.requireSpaceRole).toHaveBeenCalledWith('owner', 1, ['OWNER'])
    expect(box.updateTravel).toHaveBeenCalled()
  })

  it('既不是作者也不是空间 OWNER：403，且不写库', async () => {
    box.requireSpaceRole.mockRejectedValue(new box.SpaceAccessError('当前角色无权执行该操作'))

    await expect(callPost({ visibility: 'PUBLIC' }, ctx({ userId: 99, username: 'bob' }))).rejects.toMatchObject({
      status: 403,
    })
    expect(box.updateTravel).not.toHaveBeenCalled()
    expect(box.syncMemoryVisibility).not.toHaveBeenCalled()
  })

  it('个人旅行（无空间）非作者：403', async () => {
    box.state.travel.spaceId = null

    await expect(callPost({ visibility: 'PUBLIC' }, ctx({ userId: 99, username: 'bob' }))).rejects.toMatchObject({
      status: 403,
    })
  })

  it('回传本次同步的回忆条数（非计划转换的旅行恒为 0）', async () => {
    box.syncMemoryVisibility.mockResolvedValue(3)

    const json = await (await callPost({ visibility: 'PUBLIC' })).json()
    expect(json.memoriesSynced).toBe(3)
  })

  it('回忆同步失败 → 500（旅行可见性已改，提示重试；操作幂等）', async () => {
    box.syncMemoryVisibility.mockRejectedValue(new Error('memory boom'))

    await expect(callPost({ visibility: 'PUBLIC' })).rejects.toMatchObject({ status: 500 })
    expect(box.updateTravel).toHaveBeenCalled()
  })

  it('visibility 非法 → 400；旅行不存在 → 404', async () => {
    await expect(callPost({ visibility: 'EVERYONE' })).rejects.toBeInstanceOf(ApiError)

    box.travel.findUnique.mockResolvedValue(null)
    await expect(callPost({ visibility: 'PUBLIC' })).rejects.toMatchObject({ status: 404 })
  })
})

/**
 * 真实 syncTravelPost 的公开 / 下架语义（路由复用的就是它）：
 * 用 importActual 拿回未被 mock 的原始实现，断言"取消公开=删帖"。
 */
describe('syncTravelPost 的公开 / 下架语义', () => {
  const baseTravel = {
    id: 55,
    spaceId: 1,
    ownerId: 7,
    title: '杭州三日',
    description: null,
    coverMediaId: null,
  }

  it('visibility=SPACE → 删除 TravelPost（从旅行圈消失）', async () => {
    const actual = await vi.importActual<typeof import('@/lib/modules/social/travel-post.service')>(
      '@/lib/modules/social/travel-post.service',
    )
    box.travel.findUnique.mockResolvedValue({ ...baseTravel, visibility: 'SPACE', isPublic: false })

    const result = await actual.syncTravelPost(55)
    expect(result).toBeNull()
    expect(box.travelPost.deleteMany).toHaveBeenCalledWith({ where: { travelId: 55 } })
  })

  it('visibility=PUBLIC → upsert TravelPost（进入旅行圈）', async () => {
    const actual = await vi.importActual<typeof import('@/lib/modules/social/travel-post.service')>(
      '@/lib/modules/social/travel-post.service',
    )
    box.travel.findUnique.mockResolvedValue({ ...baseTravel, visibility: 'PUBLIC', isPublic: true })
    box.travelPost.findUnique.mockResolvedValue(null)
    box.travelPost.create.mockResolvedValue({ id: 901 })

    const result = await actual.syncTravelPost(55)
    expect(result).toEqual({ id: 901, published: true })
    expect(box.travelPost.create).toHaveBeenCalledWith({
      data: {
        travelId: 55,
        authorId: 7,
        visibility: 'PUBLIC',
        title: '杭州三日',
        summary: null,
        coverMediaId: null,
      },
    })
  })
})
