/**
 * 计划协同数据层单测（P1a）：version 乐观锁冲突、toggle 原子性、plan-doc 物化幂等。
 *
 * 做法：mock '@/lib/db' 的 prisma（含 $transaction 直接把 tx 传进回调），
 * 这样可以在不连库的情况下精确断言「SQL 的 WHERE/UPDATE 语义」——
 * 例如 CAS 必须带 version、toggle 只比较 done、同 state 提交不能重复建行。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock, txMock, permissionsMock } = vi.hoisted(() => {
  const txMock = {
    spacePlanDay: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    spacePlanItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      aggregate: vi.fn(),
    },
    spacePlanItemMedia: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    spacePlanEvent: { create: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() },
    spacePlanDoc: { findUnique: vi.fn(), upsert: vi.fn() },
    spacePlanPresence: { deleteMany: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
    spaceTravelPlan: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  }
  const prismaMock = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock)),
    ...txMock,
  }
  const permissionsMock = {
    requireSpaceRole: vi.fn(async () => ({ spaceId: 1, role: 'OWNER', isOwner: true })),
    requireSpaceMember: vi.fn(async () => ({ spaceId: 1, role: 'OWNER', isOwner: true })),
    SpaceAccessError: class SpaceAccessError extends Error {},
  }
  return { prismaMock, txMock, permissionsMock }
})

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))
vi.mock('@/lib/modules/space/permissions', () => permissionsMock)

import { PrismaSpacePlanCollabRepository } from '@/lib/modules/space/space-plan-collab.repository'
import { SpacePlanCollabService } from '@/lib/modules/space/space-plan-collab.service'
import { PlanConflictError } from '@/lib/modules/space/space-plan-errors'

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    dayId: 100,
    kind: 'SPOT',
    startAt: new Date(Date.UTC(2026, 11, 6, 9, 0)),
    endAt: null,
    title: '西湖环湖',
    place: '杭州',
    costCents: null,
    note: null,
    done: false,
    doneBy: null,
    sortOrder: 0,
    version: 3,
    updatedBy: 'bob',
    updatedAt: new Date('2026-11-28T04:00:00.000Z'),
    media: [],
    ...overrides,
  }
}

function planRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    spaceId: 1,
    title: '杭州三日',
    destination: '杭州',
    startDate: null,
    endDate: null,
    budget: null,
    note: null,
    status: 'PLANNING',
    tasks: [],
    taskCount: 0,
    taskDoneCount: 0,
    planMeta: null,
    coverMediaId: null,
    docRevision: 0,
    version: 4,
    createdById: 7,
    createdBy: 'alice',
    convertedTravelId: null,
    convertedTravelSlug: null,
    createdAt: '2026-11-20T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  txMock.spacePlanEvent.create.mockResolvedValue({ id: 1 })
  // 物化路径的默认空结果（各用例按需覆盖）
  txMock.spacePlanDay.findMany.mockResolvedValue([])
  txMock.spacePlanDay.create.mockResolvedValue({ id: 100 })
  txMock.spacePlanItem.findMany.mockResolvedValue([])
  txMock.spacePlanItem.create.mockResolvedValue({ id: 200 })
  txMock.spacePlanItemMedia.findMany.mockResolvedValue([])
  txMock.spacePlanDoc.upsert.mockResolvedValue({ planId: 1 })
  txMock.spaceTravelPlan.update.mockResolvedValue({ id: 1 })
  txMock.spacePlanPresence.deleteMany.mockResolvedValue({ count: 0 })
  txMock.spacePlanPresence.upsert.mockResolvedValue({ planId: 1 })
})

/** toggle 的两类查询：读当前 done（select 只有 id/done） vs 更新后读整行（ITEM_SELECT 含 title） */
function mockToggleReads(afterUpdateRow: Record<string, unknown>) {
  txMock.spacePlanItem.findUnique.mockImplementation(async (args: { select?: Record<string, unknown> }) => {
    if (args?.select && !('title' in args.select)) return { id: 9, done: false }
    return itemRow(afterUpdateRow)
  })
}

describe('块级 version 乐观锁（R1.3 L2）', () => {
  it('updateItemVersioned：version 不匹配 → conflict=true + 返回当前行，且不追加事件', async () => {
    const repo = new PrismaSpacePlanCollabRepository()
    txMock.spacePlanItem.findUnique
      .mockResolvedValueOnce(itemRow({ version: 3, title: '旧标题' }))
      .mockResolvedValueOnce(itemRow({ version: 3, title: '别人刚改的标题' }))
    txMock.spacePlanItem.updateMany.mockResolvedValue({ count: 0 })

    const result = await repo.updateItemVersioned(1, 9, 'alice', 5, { title: '我的标题' })

    expect(result.conflict).toBe(true)
    expect(result.eventId).toBeNull()
    expect(result.item?.title).toBe('别人刚改的标题')
    expect(txMock.spacePlanItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 9, version: 5 } }),
    )
    expect(txMock.spacePlanEvent.create).not.toHaveBeenCalled()
  })

  it('updateItemVersioned：version 匹配 → 更新成功、version+1 并追加 item.update 事件', async () => {
    const repo = new PrismaSpacePlanCollabRepository()
    txMock.spacePlanItem.findUnique
      .mockResolvedValueOnce(itemRow({ version: 5 }))
      .mockResolvedValueOnce(itemRow({ version: 6, title: '我的新标题' }))
    txMock.spacePlanItem.updateMany.mockResolvedValue({ count: 1 })
    txMock.spacePlanEvent.create.mockResolvedValue({ id: 42 })

    const result = await repo.updateItemVersioned(1, 9, 'alice', 5, { title: '我的新标题' })

    expect(result.conflict).toBe(false)
    expect(result.eventId).toBe(42)
    const updateArg = txMock.spacePlanItem.updateMany.mock.calls[0][0]
    expect(updateArg.where).toEqual({ id: 9, version: 5 })
    expect(updateArg.data.version).toEqual({ increment: 1 })
    expect(updateArg.data.updatedBy).toBe('alice')
    expect(txMock.spacePlanEvent.create.mock.calls[0][0].data).toMatchObject({ planId: 1, actor: 'alice', action: 'item.update' })
  })

  it('deleteItemVersioned：version 不匹配 → deleted=false + 当前行，不删也不发事件', async () => {
    const repo = new PrismaSpacePlanCollabRepository()
    txMock.spacePlanItem.findUnique.mockResolvedValue(itemRow({ version: 7 }))
    txMock.spacePlanItem.deleteMany.mockResolvedValue({ count: 0 })

    const result = await repo.deleteItemVersioned(1, 9, 'alice', 6)

    expect(result.deleted).toBe(false)
    expect(result.current?.version).toBe(7)
    expect(txMock.spacePlanEvent.create).not.toHaveBeenCalled()
  })

  it('service.updateItem：repository 报冲突 → 抛 PlanConflictError 且带 current 当前行', async () => {
    const planRepo = { findById: vi.fn(async () => planRecord()) }
    const collabRepo = {
      findItemWithPlan: vi.fn(async () => ({ item: itemRow({ version: 3 }), planId: 1 })),
      updateItemVersioned: vi.fn(async () => ({ item: itemRow({ version: 3, title: '别人改的' }), eventId: null, conflict: true })),
    }
    const service = new SpacePlanCollabService(planRepo as never, collabRepo as never)

    await expect(
      service.updateItem({ username: 'alice', userId: 7 }, 1, 1, 9, { version: 5, title: '我的' }),
    ).rejects.toBeInstanceOf(PlanConflictError)
    await expect(
      service.updateItem({ username: 'alice', userId: 7 }, 1, 1, 9, { version: 5, title: '我的' }),
    ).rejects.toMatchObject({ expectedVersion: 5, current: expect.objectContaining({ version: 3 }) })
  })

  it('service.patchPlan：计划级 version 不匹配 → 抛 PlanConflictError（409 语义）', async () => {
    const planRepo = { findById: vi.fn(async () => planRecord({ version: 4 })) }
    const collabRepo = { updatePlan: vi.fn(async () => ({ updated: 0, eventId: null, nextVersion: null })) }
    const service = new SpacePlanCollabService(planRepo as never, collabRepo as never)

    await expect(
      service.patchPlan({ username: 'alice', userId: 7 }, 1, 1, { title: '改名' }, 2),
    ).rejects.toBeInstanceOf(PlanConflictError)
    expect(collabRepo.updatePlan).toHaveBeenCalledWith(1, 2, { title: '改名' }, 'alice')
  })
})

describe('toggle 原子性（只 CAS done，不覆盖别人的改动）', () => {
  it('并发勾选撞车（count=0）→ 重试一次成功，事件只追加一次', async () => {
    const repo = new PrismaSpacePlanCollabRepository()
    mockToggleReads({ done: true, version: 4 })
    txMock.spacePlanItem.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
    txMock.spacePlanEvent.create.mockResolvedValue({ id: 77 })

    const result = await repo.toggleItemAtomic(1, 9, 'alice')

    expect(result.item?.done).toBe(true)
    expect(result.eventId).toBe(77)
    expect(txMock.spacePlanItem.updateMany).toHaveBeenCalledTimes(2)
    expect(txMock.spacePlanEvent.create).toHaveBeenCalledTimes(1)
  })

  it('勾选只写 done/doneBy/version/updatedBy —— 不碰 title/startAt（不覆盖别人的改动）', async () => {
    const repo = new PrismaSpacePlanCollabRepository()
    mockToggleReads({ done: true })
    txMock.spacePlanItem.updateMany.mockResolvedValue({ count: 1 })

    await repo.toggleItemAtomic(1, 9, 'alice')

    const updateArg = txMock.spacePlanItem.updateMany.mock.calls[0][0]
    expect(Object.keys(updateArg.data).sort()).toEqual(['done', 'doneBy', 'updatedBy', 'version'])
    expect(updateArg.where).toEqual({ id: 9, done: false })
    expect(updateArg.data.done).toBe(true)
    expect(updateArg.data.doneBy).toBe('alice')
  })

  it('显式 done=true 时按传入值写（取消勾选写 null 的 doneBy）', async () => {
    const repo = new PrismaSpacePlanCollabRepository()
    txMock.spacePlanItem.findUnique.mockImplementation(async (args: { select?: Record<string, unknown> }) => {
      if (args?.select && !('title' in args.select)) return { id: 9, done: true }
      return itemRow({ done: false, doneBy: null })
    })
    txMock.spacePlanItem.updateMany.mockResolvedValue({ count: 1 })

    await repo.toggleItemAtomic(1, 9, 'alice', false)

    const updateArg = txMock.spacePlanItem.updateMany.mock.calls[0][0]
    expect(updateArg.data.done).toBe(false)
    expect(updateArg.data.doneBy).toBeNull()
    expect(updateArg.where).toEqual({ id: 9, done: true })
  })

  it('块已被删除 → 返回 null（service 转 404，不报 500）', async () => {
    const repo = new PrismaSpacePlanCollabRepository()
    txMock.spacePlanItem.findUnique.mockResolvedValue(null)
    const result = await repo.toggleItemAtomic(1, 9, 'alice')
    expect(result.item).toBeNull()
    expect(txMock.spacePlanEvent.create).not.toHaveBeenCalled()
  })
})

describe('内部 plan-doc 物化幂等', () => {
  const state = Buffer.from([1, 2, 3, 4, 5])

  it('同一份 state 重复提交 → 不物化、不追加事件、revision 不变（idempotent=true）', async () => {
    const repo = new PrismaSpacePlanCollabRepository()
    txMock.spacePlanDoc.findUnique.mockResolvedValue({ state, revision: 7, lastEvent: 11 })

    const result = await repo.syncDoc({
      planId: 1,
      yjsState: state.toString('base64'),
      materialized: { days: [{ id: 'd1', title: 'Day 1' }], items: [{ id: 'i1', dayId: 'd1', title: '西湖' }] },
    })

    expect(result).toMatchObject({ idempotent: true, revision: 7, eventId: 11, lastEventId: 11 })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(txMock.spacePlanDay.create).not.toHaveBeenCalled()
    expect(txMock.spacePlanItem.create).not.toHaveBeenCalled()
    expect(txMock.spacePlanEvent.create).not.toHaveBeenCalled()
  })

  it('state 相同但带 presence → 只刷新 presence，不推进 revision/事件', async () => {
    const repo = new PrismaSpacePlanCollabRepository()
    txMock.spacePlanDoc.findUnique.mockResolvedValue({ state, revision: 3, lastEvent: 5 })

    const result = await repo.syncDoc({
      planId: 1,
      yjsState: state.toString('base64'),
      materialized: { days: [], items: [] },
      presence: [{ userId: 7, username: 'alice', editingItemId: 9 }],
    })

    expect(result.idempotent).toBe(true)
    expect(result.revision).toBe(3)
    expect(txMock.spacePlanPresence.upsert).toHaveBeenCalledTimes(1)
    expect(txMock.spacePlanEvent.create).not.toHaveBeenCalled()
  })

  it('新 state → revision+1、物化天/块（字符串 id → DB id）、追加 doc.sync、回写 docRevision', async () => {
    const repo = new PrismaSpacePlanCollabRepository()
    txMock.spacePlanDoc.findUnique.mockResolvedValue({ state: Buffer.from([9]), revision: 2, lastEvent: 5 })
    txMock.spacePlanDay.findMany.mockResolvedValue([])
    txMock.spacePlanDay.create.mockResolvedValue({ id: 100 })
    txMock.spacePlanItem.findMany.mockResolvedValue([])
    txMock.spacePlanItem.create.mockResolvedValue({ id: 200 })
    txMock.spacePlanEvent.create.mockResolvedValue({ id: 6 })

    const result = await repo.syncDoc({
      planId: 1,
      yjsState: Buffer.from([1, 2, 3]).toString('base64'),
      materialized: {
        days: [{ id: 'tmp-d1', date: '2026-12-06', title: '抵达杭州', theme: '第一晚' }],
        items: [
          {
            id: 'tmp-i1',
            dayId: 'tmp-d1',
            kind: 'TRANSPORT',
            startAt: '2026-12-06T01:00:00.000Z',
            title: '上海 → 杭州',
            sortOrder: 0,
            mediaIds: [],
          },
        ],
        meta: { engineVersion: 1, pace: 'STANDARD' },
      },
    })

    expect(result.idempotent).toBe(false)
    expect(result.revision).toBe(3)
    expect(result.eventId).toBe(6)
    expect(result.idMap.days['tmp-d1']).toBe(100)
    expect(result.idMap.items['tmp-i1']).toBe(200)
    expect(txMock.spacePlanDay.create).toHaveBeenCalledTimes(1)
    expect(txMock.spacePlanItem.create).toHaveBeenCalledTimes(1)
    expect(txMock.spacePlanDoc.upsert).toHaveBeenCalledTimes(1)
    expect(txMock.spaceTravelPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: expect.objectContaining({ docRevision: 3 }) }),
    )
    expect(txMock.spacePlanEvent.create.mock.calls[0][0].data.action).toBe('doc.sync')
  })

  it('同一份物料重复提交（state 不同但行已在）→ 按 (dayId+sortOrder) 对齐，不重复建行', async () => {
    const repo = new PrismaSpacePlanCollabRepository()
    txMock.spacePlanDoc.findUnique.mockResolvedValue({ state: Buffer.from([7]), revision: 1, lastEvent: 2 })
    txMock.spacePlanDay.findMany.mockResolvedValue([
      { id: 100, sortOrder: 0, date: new Date(Date.UTC(2026, 11, 6)), title: '抵达杭州', theme: '第一晚', summary: null },
    ])
    txMock.spacePlanItem.findMany.mockResolvedValue([
      { id: 200, dayId: 100, kind: 'SPOT', startAt: null, endAt: null, title: '西湖', place: null, costCents: null, note: null, done: false, doneBy: null, sortOrder: 0 },
    ])
    txMock.spacePlanEvent.create.mockResolvedValue({ id: 3 })

    const result = await repo.syncDoc({
      planId: 1,
      yjsState: Buffer.from([8]).toString('base64'),
      materialized: {
        days: [{ date: '2026-12-06', title: '抵达杭州', theme: '第一晚' }],
        items: [{ dayId: '100', kind: 'SPOT', title: '西湖', sortOrder: 0 }],
      },
    })

    expect(txMock.spacePlanDay.create).not.toHaveBeenCalled()
    expect(txMock.spacePlanItem.create).not.toHaveBeenCalled()
    expect(result.idMap.days['100']).toBe(100)
    expect(result.idMap.items['200']).toBe(200)
  })
})
