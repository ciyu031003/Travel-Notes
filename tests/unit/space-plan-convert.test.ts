import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * P3 · 计划 → 旅行记录深度转换（convertPlan）单测。
 *
 * 覆盖验收清单里的四类：
 *   ① 映射：kind→type（FLEX→ACTIVITY）、天日期+墙上时间组合、排序、空天跳过、回忆按天且不建空回忆；
 *   ② 幂等：重复 convert 不再建天/块，直接返回 alreadyConverted；
 *   ③ 公开：publish=true → Travel.visibility=PUBLIC + TravelPost 投影（真实 syncTravelPost）；
 *   ④ 权限：VIEWER → 403（SpaceAccessError）、跨空间 → 404（SpacePlanNotFoundError）。
 *
 * 做法与 tests/unit/travel-write-transaction.test.ts 一致：mock '@/lib/db' 的 prisma，
 * 用「事务深度」证明所有写都在同一个 $transaction 里；TravelPost 走真实服务，
 * 这样断言的是真实投影语义（PUBLIC→建帖、SPACE→删帖），而不是我们自己 mock 的行为。
 */

const box = vi.hoisted(() => {
  type Call = { model: string; op: string; inTx: number; args: any[] }
  const state = { inTx: 0, calls: [] as Call[] }
  const handlers = new Map<string, (...args: any[]) => unknown>()
  const on = (model: string, op: string, fn: (...args: any[]) => unknown) => {
    handlers.set(model + '.' + op, fn)
  }
  const reset = () => {
    state.inTx = 0
    state.calls.length = 0
    handlers.clear()
  }
  const model = (name: string, ops: string[]) => {
    const obj: Record<string, any> = {}
    for (const op of ops) {
      obj[op] = vi.fn(async (...args: any[]) => {
        state.calls.push({ model: name, op, inTx: state.inTx, args })
        const handler = handlers.get(name + '.' + op)
        return handler ? await handler(...args) : undefined
      })
    }
    return obj
  }
  const prisma: any = {
    travel: model('travel', ['create', 'findUnique', 'findFirst', 'update']),
    travelDay: model('travelDay', ['create']),
    itineraryItem: model('itineraryItem', ['create']),
    memory: model('memory', ['create', 'updateMany']),
    memoryMedia: model('memoryMedia', ['createMany']),
    travelPost: model('travelPost', ['findUnique', 'create', 'update', 'deleteMany']),
    spacePlanDay: model('spacePlanDay', ['findMany']),
    spacePlanEvent: model('spacePlanEvent', ['create', 'findFirst']),
    spaceTravelPlan: model('spaceTravelPlan', ['findUnique', 'updateMany']),
    spaceMember: model('spaceMember', ['findUnique', 'findFirst']),
    space: model('space', ['findUnique']),
    user: model('user', ['findFirst', 'findUnique']),
    media: model('media', ['findUnique']),
  }
  prisma.$transaction = vi.fn(async (fn: any) => {
    state.inTx += 1
    try {
      return await fn(prisma)
    } finally {
      state.inTx -= 1
    }
  })
  return { prisma, state, on, reset }
})

vi.mock('@/lib/db', () => ({ prisma: box.prisma }))
vi.mock('@/lib/modules/audit/audit-log.service', () => ({ writeAuditLog: vi.fn(async () => {}) }))
// 转换只关心「投影是否写入」，缓存失效是旁路（不连 Redis）
vi.mock('@/lib/modules/social/feed-cache', () => ({
  SOCIAL_FEED_CACHE_TAG: 'social-feed',
  SOCIAL_FEED_CACHE_TTL_SECONDS: 60,
  getSocialFeedCache: () => ({ get: vi.fn(async () => null), set: vi.fn(async () => {}), deleteByTag: vi.fn(async () => {}) }),
  invalidateSocialFeedCache: vi.fn(async () => {}),
}))
vi.mock('@/lib/modules/travel/space-travel.repository', () => ({
  prismaTravelRepository: {
    slugExists: vi.fn(async () => false),
    create: vi.fn(),
    findById: vi.fn(),
    listForSpace: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

import {
  buildConvertedTravelDays,
  combinePlanDayAndTime,
  composeItineraryNotes,
  parseConvertedMemoryIds,
  spacePlanService,
  syncConvertedTravelMemoryVisibility,
  type ConvertiblePlanDay,
} from '@/lib/modules/space/space-plan.service'
import { SpaceAccessError } from '@/lib/modules/space/permissions'
import { SpacePlanNotFoundError } from '@/lib/modules/space/space-plan-errors'
import { ApiError } from '@/lib/api-response'
import { planApiError } from '@/app/api/spaces/[id]/plans/_errors'

// ============================================================
// 测试数据
// ============================================================

/** 计划行（prisma.spaceTravelPlan.findUnique 的 select 形状） */
function planRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    spaceId: 1,
    title: '杭州三日',
    destination: '杭州',
    startDate: new Date('2026-12-20T00:00:00.000Z'),
    endDate: new Date('2026-12-22T00:00:00.000Z'),
    budget: 6800,
    note: '两个人，慢慢走',
    status: 'PLANNING',
    tasks: [],
    planMeta: null,
    coverMediaId: 77,
    docRevision: 0,
    version: 4,
    createdById: 7,
    createdBy: 'alice',
    convertedTravelId: null,
    createdAt: new Date('2026-11-28T00:00:00.000Z'),
    updatedAt: new Date('2026-11-28T00:00:00.000Z'),
    convertedTravel: null,
    ...overrides,
  }
}

/** SpacePlanDay 行（含 items/media，prisma.spacePlanDay.findMany 的形状） */
function dayRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    date: new Date(2026, 11, 20),
    title: '抵达杭州',
    theme: null,
    summary: null,
    sortOrder: 0,
    items: [
      {
        id: 100,
        kind: 'TRANSPORT',
        startAt: new Date(Date.UTC(2026, 11, 20, 9, 0)),
        endAt: null,
        title: '上海 → 杭州（高铁 G7301）',
        place: '虹桥站',
        costCents: 14600,
        note: '06:40 出门',
        sortOrder: 0,
        media: [{ mediaId: 501 }],
      },
    ],
    ...overrides,
  }
}

function callOf(model: string, op: string, nth = 0) {
  const found = box.state.calls.filter((c) => c.model === model && c.op === op)
  if (!found[nth]) throw new Error('未调用 ' + model + '.' + op)
  return found[nth]
}
function callsOf(model: string, op: string) {
  return box.state.calls.filter((c) => c.model === model && c.op === op)
}

/** 默认权限：alice 是空间 OWNER */
function allowOwner() {
  box.on('spaceMember', 'findUnique', () => ({ spaceId: 1, username: 'alice', role: 'OWNER', status: 'ACTIVE' }))
  box.on('space', 'findUnique', () => ({ spaceType: 'COUPLE' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  box.reset()
  allowOwner()
  // 计划封面指向的媒体存在（封面失效的兜底逻辑另有覆盖点）
  box.on('media', 'findUnique', () => ({ id: 77 }))
})

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorSpy.mockRestore())

// ============================================================
// ① 纯映射
// ============================================================

describe('映射：kind → ItineraryItem.type', () => {
  it('TRANSPORT/HOTEL/FOOD/SPOT/ACTIVITY 原样保留，FLEX 归为 ACTIVITY，未知值兜底 SPOT', () => {
    const days = buildConvertedTravelDays(
      { startDate: null, endDate: null },
      [
        {
          date: '2026-12-20',
          title: '抵达',
          theme: null,
          summary: null,
          sortOrder: 0,
          items: [
            { kind: 'TRANSPORT', title: '去', startAt: null, endAt: null, place: null, costCents: null, note: null, sortOrder: 0, mediaIds: [] },
            { kind: 'HOTEL', title: '住', startAt: null, endAt: null, place: null, costCents: null, note: null, sortOrder: 1, mediaIds: [] },
            { kind: 'FOOD', title: '吃', startAt: null, endAt: null, place: null, costCents: null, note: null, sortOrder: 2, mediaIds: [] },
            { kind: 'SPOT', title: '玩', startAt: null, endAt: null, place: null, costCents: null, note: null, sortOrder: 3, mediaIds: [] },
            { kind: 'ACTIVITY', title: '活动', startAt: null, endAt: null, place: null, costCents: null, note: null, sortOrder: 4, mediaIds: [] },
            { kind: 'FLEX', title: '机动', startAt: null, endAt: null, place: null, costCents: null, note: null, sortOrder: 5, mediaIds: [] },
            { kind: null, title: '脏数据', startAt: null, endAt: null, place: null, costCents: null, note: null, sortOrder: 6, mediaIds: [] },
          ],
        },
      ],
    )
    expect(days).toHaveLength(1)
    expect(days[0].items.map((item) => item.type)).toEqual([
      'TRANSPORT',
      'HOTEL',
      'FOOD',
      'SPOT',
      'ACTIVITY',
      'ACTIVITY',
      'SPOT',
    ])
  })
})

describe('映射：天日期 + 墙上时间组合', () => {
  it('块的时分秒挂到当天的年月日上（UTC 字段即墙上时间）', () => {
    const start = combinePlanDayAndTime('2026-12-21', '2026-12-21T09:00:00.000Z')
    const end = combinePlanDayAndTime('2026-12-21', '2026-12-21T11:30:00.000Z')
    expect(start?.getTime()).toBe(Date.UTC(2026, 11, 21, 9, 0, 0))
    expect(end?.getTime()).toBe(Date.UTC(2026, 11, 21, 11, 30, 0))
  })

  it('块只填了时间（1970 基准日）也落到计划的当天', () => {
    const start = combinePlanDayAndTime('2026-12-21', '1970-01-01T18:30:00.000Z')
    expect(start?.getTime()).toBe(Date.UTC(2026, 11, 21, 18, 30, 0))
  })

  it('块自带的日期与天不一致时，以天为准（换天后块时间跟着走）', () => {
    const start = combinePlanDayAndTime('2026-12-25', '2026-12-21T09:00:00.000Z')
    expect(start?.getTime()).toBe(Date.UTC(2026, 11, 25, 9, 0, 0))
  })

  it('天没有日期时：块自带真实日期则保留，1970 时间串丢弃（不写 1970 的假时间）', () => {
    expect(combinePlanDayAndTime(null, '2026-12-21T09:00:00.000Z')?.getTime()).toBe(Date.UTC(2026, 11, 21, 9, 0, 0))
    expect(combinePlanDayAndTime(null, '1970-01-01T09:00:00.000Z')).toBeNull()
    expect(combinePlanDayAndTime('2026-12-21', null)).toBeNull()
  })
})

describe('映射：排序 / 空天跳过 / 回忆', () => {
  it('块与天都按顺序重新编号，空天（无日期无标题无块）被跳过', () => {
    const days = buildConvertedTravelDays(
      { startDate: null, endDate: null },
      [
        { date: '2026-12-20', title: null, theme: null, summary: null, sortOrder: 5, items: [] },
        { date: null, title: null, theme: null, summary: null, sortOrder: 6, items: [] },
        {
          date: '2026-12-22',
          title: '返程',
          theme: null,
          summary: null,
          sortOrder: 7,
          items: [
            { kind: 'TRANSPORT', title: '回程', startAt: null, endAt: null, place: null, costCents: null, note: null, sortOrder: 9, mediaIds: [] },
            { kind: 'FOOD', title: '早餐', startAt: null, endAt: null, place: null, costCents: null, note: null, sortOrder: 3, mediaIds: [] },
          ],
        },
      ],
    )
    expect(days.map((day) => day.sortOrder)).toEqual([0, 1])
    expect(days.map((day) => day.date?.getDate())).toEqual([20, 22])
    // 块按 sortOrder 排序后重新编号 0..n-1
    expect(days[1].items.map((item) => item.title)).toEqual(['早餐', '回程'])
    expect(days[1].items.map((item) => item.sortOrder)).toEqual([0, 1])
  })

  it('有备注或照片才建回忆；没有则不建空回忆', () => {
    const days = buildConvertedTravelDays(
      { startDate: null, endDate: null },
      [
        {
          date: '2026-12-20',
          title: '抵达',
          theme: null,
          summary: '今天风很大，但湖很好看',
          sortOrder: 0,
          items: [],
        },
        {
          date: '2026-12-21',
          title: '骑行',
          theme: null,
          summary: null,
          sortOrder: 1,
          items: [
            { kind: 'SPOT', title: '环湖', startAt: null, endAt: null, place: '洱海', costCents: null, note: null, sortOrder: 0, mediaIds: [501, 502, 501] },
          ],
        },
        {
          date: '2026-12-22',
          title: '返程',
          theme: null,
          summary: null,
          sortOrder: 2,
          items: [{ kind: 'TRANSPORT', title: '回程', startAt: null, endAt: null, place: null, costCents: null, note: null, sortOrder: 0, mediaIds: [] }],
        },
      ],
    )
    expect(days[0].memory).toEqual({ title: '抵达', content: '今天风很大，但湖很好看', mediaIds: [] })
    expect(days[1].memory).toEqual({ title: '骑行', content: null, mediaIds: [501, 502] })
    expect(days[2].memory).toBeNull()
  })

  it('地点/花销/备注压进 notes（ItineraryItem 没有 place/cost 列，不能丢）', () => {
    const notes = composeItineraryNotes({
      kind: 'FOOD',
      title: '晚餐',
      startAt: null,
      endAt: null,
      place: '河坊街',
      costCents: 8800,
      note: '提前订位',
      sortOrder: 0,
      mediaIds: [],
    })
    expect(notes).toContain('提前订位')
    expect(notes).toContain('地点：河坊街')
    expect(notes).toContain('预算：¥88')
  })

  it('老计划没有天骨架时，按旅行区间补出分天结构（不返回 0 天的空壳）', () => {
    const days = buildConvertedTravelDays(
      { startDate: '2026-12-20T00:00:00.000Z', endDate: '2026-12-22T00:00:00.000Z' },
      [],
    )
    expect(days).toHaveLength(3)
    expect(days.map((day) => day.items.length)).toEqual([0, 0, 0])
    expect(days.map((day) => day.sortOrder)).toEqual([0, 1, 2])
  })
})

// ============================================================
// ② 转换服务：一个事务 + 幂等
// ============================================================

describe('convertPlan：首次转换（一个事务写完整结构）', () => {
  beforeEach(() => {
    let convertedId: number | null = null
    box.on('spaceTravelPlan', 'findUnique', () => planRow({ convertedTravelId: convertedId }))
    box.on('spacePlanDay', 'findMany', () => [
      dayRow(),
      dayRow({
        id: 11,
        date: new Date(2026, 11, 21),
        title: '环湖骑行',
        summary: '今天风很大，但湖很好看',
        sortOrder: 1,
        items: [
          {
            id: 101,
            kind: 'FLEX',
            startAt: new Date(Date.UTC(2026, 11, 21, 15, 0)),
            endAt: null,
            title: '茶馆发呆',
            place: null,
            costCents: null,
            note: null,
            sortOrder: 0,
            media: [],
          },
        ],
      }),
    ])
    box.on('travel', 'create', () => ({ id: 42 }))
    box.on('travelDay', 'create', () => ({ id: 900 }))
    box.on('itineraryItem', 'create', () => ({ id: 901 }))
    box.on('memory', 'create', () => ({ id: 902 }))
    box.on('memoryMedia', 'createMany', () => ({ count: 1 }))
    let memoryId = 901
    box.on('memory', 'create', () => ({ id: (memoryId += 1) }))
    box.on('spacePlanEvent', 'create', () => ({ id: 500 }))
    box.on('spaceTravelPlan', 'updateMany', (query: any) => {
      convertedId = Number(query?.data?.convertedTravelId ?? 42)
      return { count: 1 }
    })
  })

  it('Travel 字段来自计划；天/块/回忆全部建出来，且都在同一个事务里', async () => {
    const result = await spacePlanService.convertPlan({ username: 'alice', userId: 7 }, 1, 1)

    expect(result.alreadyConverted).toBe(false)
    expect(result.published).toBe(false)
    expect(result.travelId).toBe(42)
    expect(result.travelSlug).toBe('plan-1')
    expect(result.plan.convertedTravelId).toBe(42)

    const travelCreate = callOf('travel', 'create')
    const data = travelCreate.args[0].data
    expect(data).toMatchObject({
      spaceId: 1,
      ownerId: 7,
      title: '杭州三日',
      location: '杭州',
      description: '两个人，慢慢走',
      budget: 6800,
      coverMediaId: 77,
      travelType: 'COUPLE',
      status: 'PLANNED',
      visibility: 'SPACE',
      isPublic: false,
    })

    expect(callsOf('travelDay', 'create')).toHaveLength(2)
    expect(callsOf('itineraryItem', 'create')).toHaveLength(2)
    // 第 2 天有备注（无照片）也建回忆；第 1 天有照片 → 建回忆 + 关联照片
    expect(callsOf('memory', 'create')).toHaveLength(2)
    expect(callsOf('memoryMedia', 'createMany')).toHaveLength(1)
    expect(callOf('memoryMedia', 'createMany').args[0].data).toEqual([
      { memoryId: 902, mediaId: 501, sortOrder: 0 },
    ])

    // 所有写都在事务里
    expect(box.prisma.$transaction).toHaveBeenCalledTimes(1)
    for (const model of ['travel', 'travelDay', 'itineraryItem', 'memory', 'spaceTravelPlan']) {
      for (const call of box.state.calls.filter((c) => c.model === model && c.op !== 'findUnique' && c.op !== 'findMany')) {
        expect(call.inTx, model + '.' + call.op + ' 应在事务内').toBe(1)
      }
    }
    // 未公开：回忆保持空间内可见，且不写 TravelPost
    for (const call of callsOf('memory', 'create')) {
      expect(call.args[0].data).toMatchObject({ visibility: 'SPACE' })
    }
    expect(callsOf('travelPost', 'create')).toHaveLength(0)
    // 转换事件记下「生成了哪些回忆」，后续公开开关据此同步可见性
    const event = callOf('spacePlanEvent', 'create')
    expect(event.args[0].data.action).toBe('plan.convert')
    expect(event.args[0].data.payload).toMatchObject({ travelId: 42, published: false, memoryIds: [902, 903] })
  })

  it('计划封面媒体已删除 → 只是不带封面，不影响整次转换（避免 FK 失败）', async () => {
    box.on('media', 'findUnique', () => null)

    const result = await spacePlanService.convertPlan({ username: 'alice', userId: 7 }, 1, 1)

    expect(result.travelId).toBe(42)
    expect(callOf('travel', 'create').args[0].data.coverMediaId).toBeNull()
  })

  it('行程项把地点/花销/备注带进 notes，时间用天日期+墙上时间', async () => {
    await spacePlanService.convertPlan({ username: 'alice', userId: 7 }, 1, 1)
    const item = callsOf('itineraryItem', 'create')[0].args[0].data
    expect(item).toMatchObject({ type: 'TRANSPORT', title: '上海 → 杭州（高铁 G7301）' })
    expect(item.startTime.getTime()).toBe(Date.UTC(2026, 11, 20, 9, 0, 0))
    expect(item.notes).toContain('地点：虹桥站')
    expect(item.notes).toContain('预算：¥146')
    // FLEX → ACTIVITY
    expect(callsOf('itineraryItem', 'create')[1].args[0].data.type).toBe('ACTIVITY')
  })
})

describe('convertPlan：幂等', () => {
  it('已转换 → 直接返回同一本旅行，不再建天/块，也不再开事务', async () => {
    box.on('spaceTravelPlan', 'findUnique', () => planRow({ convertedTravelId: 55 }))
    box.on('travel', 'findUnique', () => ({ id: 55, slug: 'hz-3', visibility: 'SPACE', travelPost: null }))

    const result = await spacePlanService.convertPlan({ username: 'alice', userId: 7 }, 1, 1)

    expect(result.alreadyConverted).toBe(true)
    expect(result.travelId).toBe(55)
    expect(result.travelSlug).toBe('hz-3')
    expect(result.published).toBe(false)
    expect(callsOf('travel', 'create')).toHaveLength(0)
    expect(callsOf('travelDay', 'create')).toHaveLength(0)
    expect(callsOf('itineraryItem', 'create')).toHaveLength(0)
    expect(box.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('并发竞争（CAS 回填失败）→ 回滚并复用对方的旅行，不产生第二本', async () => {
    let planReads = 0
    box.on('spaceTravelPlan', 'findUnique', () => {
      planReads += 1
      // 第一次读到「还没转换」，CAS 失败后重读拿到对方回填的 id
      return planReads === 1 ? planRow() : planRow({ convertedTravelId: 66 })
    })
    box.on('spacePlanDay', 'findMany', () => [dayRow()])
    box.on('travel', 'create', () => ({ id: 42 }))
    box.on('travelDay', 'create', () => ({ id: 900 }))
    box.on('itineraryItem', 'create', () => ({ id: 901 }))
    box.on('memory', 'create', () => ({ id: 902 }))
    box.on('spaceTravelPlan', 'updateMany', () => ({ count: 0 }))
    box.on('travel', 'findUnique', (query: any) => {
      const select = query?.select ?? {}
      if (select.slug) return { id: 66, slug: 'other', visibility: 'SPACE', travelPost: null }
      return { visibility: 'SPACE' }
    })

    const result = await spacePlanService.convertPlan({ username: 'alice', userId: 7 }, 1, 1)

    expect(result.alreadyConverted).toBe(true)
    expect(result.travelId).toBe(66)
    // 事务回滚（真实 Prisma 会撤销那本 42；这里断言事务深度归零且没有把 42 返回出去）
    expect(box.state.inTx).toBe(0)
  })

  it('事务内任一步失败 → 整体抛错（不留半本旅行）', async () => {
    box.on('spaceTravelPlan', 'findUnique', () => planRow())
    box.on('spacePlanDay', 'findMany', () => [dayRow()])
    box.on('travel', 'create', () => ({ id: 42 }))
    box.on('travelDay', 'create', () => ({ id: 900 }))
    box.on('itineraryItem', 'create', () => {
      throw new Error('item boom')
    })

    await expect(spacePlanService.convertPlan({ username: 'alice', userId: 7 }, 1, 1)).rejects.toThrow('转换失败')
    expect(box.state.inTx).toBe(0)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('转换旅行记录失败'),
      'item boom',
    )
  })
})

// ============================================================
// ③ 公开（publish=true → PUBLIC + TravelPost）
// ============================================================

describe('convertPlan：publish=true', () => {
  beforeEach(() => {
    box.on('spaceTravelPlan', 'findUnique', () => planRow())
    box.on('spacePlanDay', 'findMany', () => [dayRow()])
    box.on('travel', 'create', () => ({ id: 42 }))
    box.on('travelDay', 'create', () => ({ id: 900 }))
    box.on('itineraryItem', 'create', () => ({ id: 901 }))
    box.on('memoryMedia', 'createMany', () => ({ count: 1 }))
    box.on('spaceTravelPlan', 'updateMany', () => ({ count: 1 }))
    // 真实 syncTravelPost 会回读刚建的旅行
    box.on('travel', 'findUnique', () => ({
      id: 42,
      spaceId: 1,
      ownerId: 7,
      visibility: 'PUBLIC',
      isPublic: true,
      title: '杭州三日',
      description: '两个人，慢慢走',
      coverMediaId: 77,
    }))
    let memoryId = 901
    box.on('memory', 'create', () => ({ id: (memoryId += 1) }))
    box.on('spacePlanEvent', 'create', () => ({ id: 500 }))
    box.on('travelPost', 'findUnique', () => null)
    box.on('travelPost', 'create', () => ({ id: 900 }))
  })

  it('同事务把 visibility 置 PUBLIC，并 upsert TravelPost，返回 published:true', async () => {
    const result = await spacePlanService.convertPlan({ username: 'alice', userId: 7 }, 1, 1, { publish: true })

    expect(result.published).toBe(true)
    expect(callOf('travel', 'create').args[0].data).toMatchObject({ visibility: 'PUBLIC', isPublic: true })
    // 回忆（含照片）随旅行一起公开：别的用户才能在文章里看到
    expect(callOf('memory', 'create').args[0].data).toMatchObject({ visibility: 'PUBLIC' })
    expect(callOf('spacePlanEvent', 'create').args[0].data.payload).toMatchObject({
      travelId: 42,
      published: true,
      memoryIds: [902],
    })

    const postCreate = callOf('travelPost', 'create')
    expect(postCreate.args[0].data).toMatchObject({ travelId: 42, authorId: 7, visibility: 'PUBLIC', title: '杭州三日' })
    // TravelPost 投影与旅行写入同一个事务
    expect(postCreate.inTx).toBe(1)
    expect(callOf('travel', 'create').inTx).toBe(1)
  })

  it('已转换的旅行再次带 publish=true → 幂等公开（不重复建旅行，只补公开）', async () => {
    box.on('spaceTravelPlan', 'findUnique', () => planRow({ convertedTravelId: 55 }))
    box.on('travel', 'findUnique', (query: any) => {
      const select = query?.select ?? {}
      // syncTravelPost 回读：需要完整的公开态行
      if (select.title) {
        return {
          id: 55,
          spaceId: 1,
          ownerId: 7,
          visibility: 'PUBLIC',
          isPublic: true,
          title: '杭州三日',
          description: null,
          coverMediaId: null,
        }
      }
      // findConvertedTravel（幂等分支）带的 select 里有 slug
      if (select.slug) return { id: 55, slug: 'hz-3', visibility: 'SPACE', travelPost: null }
      // publishConvertedTravel 只看当前 visibility
      return { visibility: 'SPACE' }
    })
    box.on('travel', 'update', () => ({ id: 55 }))
    box.on('travelPost', 'findUnique', () => null)
    box.on('travelPost', 'create', () => ({ id: 900 }))
    // 之前那次转换记下的回忆 id（payload 以字符串形态出现，走容错解析）
    box.on('spacePlanEvent', 'findFirst', () => ({ payload: JSON.stringify({ memoryIds: [901, 902] }) }))
    box.on('memory', 'updateMany', () => ({ count: 2 }))

    const result = await spacePlanService.convertPlan({ username: 'alice', userId: 7 }, 1, 1, { publish: true })

    expect(result.alreadyConverted).toBe(true)
    expect(result.published).toBe(true)
    // 只改「计划生成的回忆」，且带 travelId 兜底防串号
    expect(callOf('memory', 'updateMany').args[0]).toMatchObject({
      where: { id: { in: [901, 902] }, travelId: 55 },
      data: { visibility: 'PUBLIC' },
    })
    expect(callsOf('travel', 'create')).toHaveLength(0)
    expect(callOf('travel', 'update').args[0].data).toMatchObject({ visibility: 'PUBLIC', isPublic: true })
  })
})

// ============================================================
// ⑤ 计划生成的回忆：可见性随公开开关同步（不误伤手工回忆）
// ============================================================

describe('parseConvertedMemoryIds', () => {
  it('兼容 JSON 字符串 / 数组 / 脏值，并去重', () => {
    expect(parseConvertedMemoryIds({ memoryIds: [11, 12, 12, 0, -1, '13'] })).toEqual([11, 12, 13])
    expect(parseConvertedMemoryIds(JSON.stringify({ memoryIds: [21] }))).toEqual([21])
    expect(parseConvertedMemoryIds(null)).toEqual([])
    expect(parseConvertedMemoryIds('not-json')).toEqual([])
    expect(parseConvertedMemoryIds({ memoryIds: 'nope' })).toEqual([])
  })
})

describe('syncConvertedTravelMemoryVisibility', () => {
  it('取消公开(SPACE)：只把转换事件里的回忆降级，并按 travelId 兜底', async () => {
    box.on('spaceTravelPlan', 'findUnique', () => ({ id: 3 }))
    box.on('spacePlanEvent', 'findFirst', () => ({ payload: JSON.stringify({ memoryIds: [11, 12, 12] }) }))
    box.on('memory', 'updateMany', () => ({ count: 2 }))

    const count = await syncConvertedTravelMemoryVisibility(55, 'SPACE')

    expect(count).toBe(2)
    expect(callOf('memory', 'updateMany').args[0]).toMatchObject({
      where: { id: { in: [11, 12] }, travelId: 55 },
      data: { visibility: 'SPACE' },
    })
  })

  it('公开(PUBLIC)：同一批回忆置 PUBLIC', async () => {
    box.on('spaceTravelPlan', 'findUnique', () => ({ id: 3 }))
    box.on('spacePlanEvent', 'findFirst', () => ({ payload: { memoryIds: [11, 12] } }))
    box.on('memory', 'updateMany', () => ({ count: 2 }))

    await syncConvertedTravelMemoryVisibility(55, 'PUBLIC')

    expect(callOf('memory', 'updateMany').args[0].data).toEqual({ visibility: 'PUBLIC' })
  })

  it('不是计划转换出来的旅行（没有 sourcePlan）→ 0，且一条回忆都不改', async () => {
    box.on('spaceTravelPlan', 'findUnique', () => null)

    const count = await syncConvertedTravelMemoryVisibility(56, 'PUBLIC')

    expect(count).toBe(0)
    expect(callsOf('memory', 'updateMany')).toHaveLength(0)
  })

  it('历史转换没有事件记录 → 0（宁可不同步，也不误伤用户手工回忆）', async () => {
    box.on('spaceTravelPlan', 'findUnique', () => ({ id: 3 }))
    box.on('spacePlanEvent', 'findFirst', () => null)

    const count = await syncConvertedTravelMemoryVisibility(57, 'PUBLIC')

    expect(count).toBe(0)
    expect(callsOf('memory', 'updateMany')).toHaveLength(0)
  })
})

describe('重复 convert：不重复造回忆、不重复发事件、不擅自改可见性', () => {
  it('已转换且未勾选公开 → 二次调用不建回忆 / 不发事件 / 不改回忆可见性', async () => {
    box.on('spaceTravelPlan', 'findUnique', () => planRow({ convertedTravelId: 55 }))
    box.on('travel', 'findUnique', () => ({ id: 55, slug: 'hz-3', visibility: 'SPACE', travelPost: null }))
    box.on('spacePlanEvent', 'create', () => ({ id: 500 }))
    box.on('memory', 'create', () => ({ id: 902 }))
    box.on('memory', 'updateMany', () => ({ count: 2 }))

    await spacePlanService.convertPlan({ username: 'alice', userId: 7 }, 1, 1)
    await spacePlanService.convertPlan({ username: 'alice', userId: 7 }, 1, 1)

    expect(callsOf('memory', 'create')).toHaveLength(0)
    expect(callsOf('spacePlanEvent', 'create')).toHaveLength(0)
    expect(callsOf('memory', 'updateMany')).toHaveLength(0)
  })
})

// ============================================================
// ④ 权限
// ============================================================

describe('权限：VIEWER 403 / 跨空间 404', () => {
  it('VIEWER 不能转换（SpaceAccessError → 路由映射 403）', async () => {
    box.on('spaceMember', 'findUnique', () => ({ spaceId: 1, username: 'viewer', role: 'VIEWER', status: 'ACTIVE' }))
    box.on('spaceTravelPlan', 'findUnique', () => planRow())

    await expect(spacePlanService.convertPlan({ username: 'viewer', userId: 9 }, 1, 1)).rejects.toBeInstanceOf(SpaceAccessError)

    let mapped: unknown
    try {
      planApiError(new SpaceAccessError('当前角色无权执行该操作'))
    } catch (error) {
      mapped = error
    }
    expect(mapped).toBeInstanceOf(ApiError)
    expect((mapped as ApiError).status).toBe(403)
  })

  it('跨空间按「不存在」处理（404，不泄露该 id 在别的空间存在）', async () => {
    box.on('spaceTravelPlan', 'findUnique', () => planRow({ spaceId: 2 }))

    await expect(spacePlanService.convertPlan({ username: 'alice', userId: 7 }, 1, 1)).rejects.toBeInstanceOf(
      SpacePlanNotFoundError,
    )

    let mapped: unknown
    try {
      planApiError(new SpacePlanNotFoundError())
    } catch (error) {
      mapped = error
    }
    expect((mapped as ApiError).status).toBe(404)
  })
})
