/**
 * 旅行删除/编辑的**授权口径**回归 —— 真机反馈「点删除 → 提示删除失败」的根因。
 *
 * 事实：`space-travel.service` 的 getTravel / updateTravel / deleteTravel 一律调用
 * `requireSpaceRole(username, t.spaceId, …)`，而 `requireSpaceMember` 是按
 * `(spaceId, username)` 唯一键查 SpaceMember 的 —— **个人旅行 spaceId 为 NULL**，
 * 永远查不到成员行 → 一律被判「无权访问该空间」→ 个人旅行删不掉、也改不了。
 * 线上库核对吻合：4 本旅行全部 spaceId=NULL、ownerId=1（用户账号）。
 *
 * 契约：
 *   · spaceId = NULL → 只认 ownerId（创建者本人可操作，他人不可）
 *   · spaceId 有值   → 仍走空间角色（OWNER/MEMBER 可写，VIEWER 只读）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const box = vi.hoisted(() => ({
  travel: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  requireSpaceRole: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ prisma: { travel: box.travel, user: box.user } }))
vi.mock('@/lib/modules/space/permissions', () => ({
  SpaceAccessError: class SpaceAccessError extends Error {},
  requireSpaceRole: box.requireSpaceRole,
}))
vi.mock('@/lib/modules/social/travel-post.service', () => ({
  syncTravelPost: vi.fn(async () => {}),
  unpublishTravelPost: vi.fn(async () => {}),
}))
vi.mock('@/lib/modules/audit/audit-log.service', () => ({ writeAuditLog: vi.fn(async () => {}) }))

import { TravelService } from '@/lib/modules/travel/space-travel.service'

function makeRepo(over: Record<string, unknown> = {}) {
  return {
    findById: vi.fn(async () => ({ id: 43, spaceId: null, title: 'x', slug: 'x' })),
    remove: vi.fn(async () => {}),
    update: vi.fn(async () => ({ id: 43 })),
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  box.user.findUnique.mockResolvedValue({ id: 1 })
  box.travel.findUnique.mockResolvedValue({ spaceId: null, ownerId: 1 })
  box.requireSpaceRole.mockResolvedValue({ spaceId: 1, role: 'OWNER', isOwner: true })
})

describe('个人旅行（spaceId = NULL）', () => {
  it('创建者本人可以删除（此前恒被判无权，真机表现就是"删除失败"）', async () => {
    const repo = makeRepo()
    const svc = new TravelService(repo as never)
    await expect(svc.deleteTravel('admin', 43)).resolves.toBeUndefined()
    expect(repo.remove).toHaveBeenCalledWith(43)
    // 个人旅行不该去问空间角色
    expect(box.requireSpaceRole).not.toHaveBeenCalled()
  })

  it('他人不能删除个人旅行，且不会真的执行删除', async () => {
    box.user.findUnique.mockResolvedValue({ id: 99 }) // 另一个用户
    const repo = makeRepo()
    const svc = new TravelService(repo as never)
    await expect(svc.deleteTravel('someone-else', 43)).rejects.toThrow(/不在你名下/)
    expect(repo.remove).not.toHaveBeenCalled()
  })

  it('创建者本人可以编辑；他人不行', async () => {
    const repo = makeRepo()
    const svc = new TravelService(repo as never)
    await expect(svc.updateTravel('admin', 43, { title: '新标题' })).resolves.toBeTruthy()
    expect(repo.update).toHaveBeenCalled()

    box.user.findUnique.mockResolvedValue({ id: 99 })
    await expect(svc.updateTravel('intruder', 43, { title: 'x' })).rejects.toThrow(/不在你名下/)
  })

  it('创建者本人可以读详情', async () => {
    const repo = makeRepo()
    const svc = new TravelService(repo as never)
    await expect(svc.getTravel('admin', 43)).resolves.toBeTruthy()
  })

  it('ownerId 缺失（历史脏数据）时拒绝，而不是放行', async () => {
    box.travel.findUnique.mockResolvedValue({ spaceId: null, ownerId: null })
    const repo = makeRepo()
    const svc = new TravelService(repo as never)
    await expect(svc.deleteTravel('admin', 43)).rejects.toThrow(/不在你名下/)
    expect(repo.remove).not.toHaveBeenCalled()
  })
})

describe('空间旅行（spaceId 有值）仍走空间角色', () => {
  it('OWNER/MEMBER 可删除，并带上正确的 spaceId 去校验', async () => {
    box.travel.findUnique.mockResolvedValue({ spaceId: 61, ownerId: 1 })
    const repo = makeRepo()
    const svc = new TravelService(repo as never)
    await expect(svc.deleteTravel('member-user', 43)).resolves.toBeUndefined()
    expect(box.requireSpaceRole).toHaveBeenCalledWith('member-user', 61, ['OWNER', 'MEMBER'])
    expect(repo.remove).toHaveBeenCalledWith(43)
  })

  it('空间角色校验失败时不得删除', async () => {
    box.travel.findUnique.mockResolvedValue({ spaceId: 61, ownerId: 1 })
    box.requireSpaceRole.mockRejectedValue(new Error('当前角色无权执行该操作'))
    const repo = makeRepo()
    const svc = new TravelService(repo as never)
    await expect(svc.deleteTravel('viewer-user', 43)).rejects.toThrow(/无权/)
    expect(repo.remove).not.toHaveBeenCalled()
  })
})
