import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 旅行日期区间 ↔ 「天」同步单测。
 *
 * 背景（真机反馈"建完旅行没法进一步设置"）：前台新增了「编辑信息」（改标题/目的地/日期区间）。
 * 改区间后必须把已有的 `TravelDay` 就地对齐，否则时间线还停在旧日期上，
 * 用户会以为"改了没生效"。这里锁住三条语义：
 *   ① 区间变长 → 补齐缺失的天；
 *   ② 区间变短 → **保留**多出来的天（里面可能已有回忆/照片，删掉等于毁数据）；
 *   ③ 没有开始日 → 至少补出 1 天，保证详情页有可下手的章节。
 */

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    travel: { findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    travelDay: {
      findMany: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

import { syncTravelDayDates, makeUniqueTravelSlug, updateTravelInfo } from '@/lib/modules/travel/travel.service'

/** 本地零点日期，避免时区把断言挪一天 */
function d(y: number, m: number, day: number) {
  return new Date(y, m - 1, day)
}

const dayRow = (id: number, date: Date | null) => ({ id, date, sortOrder: id - 1 })

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.travelDay.update.mockResolvedValue({})
  prismaMock.travelDay.createMany.mockResolvedValue({ count: 0 })
  prismaMock.travelDay.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } })
  prismaMock.travelDay.count.mockResolvedValue(0)
  prismaMock.travel.update.mockResolvedValue({ id: 1 })
  prismaMock.travel.findFirst.mockResolvedValue(null)
})

describe('syncTravelDayDates', () => {
  it('区间 3 天、已有 3 天且日期一致时不改动', async () => {
    prismaMock.travelDay.findMany.mockResolvedValue([
      dayRow(1, d(2026, 8, 31)),
      dayRow(2, d(2026, 9, 1)),
      dayRow(3, d(2026, 9, 2)),
    ])
    const changed = await syncTravelDayDates(7, d(2026, 8, 31), d(2026, 9, 2))
    expect(changed).toBe(0)
    expect(prismaMock.travelDay.update).not.toHaveBeenCalled()
    expect(prismaMock.travelDay.createMany).not.toHaveBeenCalled()
  })

  it('开始日变化 → 每一天就地对齐（不新建、不删除）', async () => {
    prismaMock.travelDay.findMany.mockResolvedValue([
      dayRow(1, d(2026, 8, 31)),
      dayRow(2, d(2026, 9, 1)),
      dayRow(3, d(2026, 9, 2)),
    ])
    const changed = await syncTravelDayDates(7, d(2026, 7, 27), d(2026, 7, 29))
    expect(changed).toBe(3)
    const dates = prismaMock.travelDay.update.mock.calls.map((c) => (c[0] as any).data.date)
    expect(dates.map((x: Date) => x.toDateString())).toEqual([
      d(2026, 7, 27).toDateString(),
      d(2026, 7, 28).toDateString(),
      d(2026, 7, 29).toDateString(),
    ])
    expect(prismaMock.travelDay.createMany).not.toHaveBeenCalled()
  })

  it('区间变长 → 补齐缺失的天（标题按序号命名）', async () => {
    prismaMock.travelDay.findMany.mockResolvedValue([dayRow(1, d(2026, 8, 31))])
    const changed = await syncTravelDayDates(7, d(2026, 8, 31), d(2026, 9, 2))
    expect(changed).toBe(2)
    const created = (prismaMock.travelDay.createMany.mock.calls[0][0] as any).data
    expect(created).toHaveLength(2)
    expect(created.map((r: any) => r.title)).toEqual(['DAY 02', 'DAY 03'])
    expect(created[0].date.toDateString()).toBe(d(2026, 9, 1).toDateString())
    expect(created[1].date.toDateString()).toBe(d(2026, 9, 2).toDateString())
  })

  it('区间变短 → 保留多出来的天（可能已有回忆/照片），只对齐区间内的', async () => {
    prismaMock.travelDay.findMany.mockResolvedValue([
      dayRow(1, d(2026, 8, 31)),
      dayRow(2, d(2026, 9, 1)),
      dayRow(3, d(2026, 9, 2)),
    ])
    // 区间收敛到 8/31 单日：只有第 1 天在区间内且本来就对得上 → 0 次改动，
    // 关键在于**没有删除**任何一天（删掉 Day 02/03 会连带丢掉里面的回忆与照片）
    const changed = await syncTravelDayDates(7, d(2026, 8, 31), d(2026, 8, 31))
    expect(changed).toBe(0)
    expect(prismaMock.travelDay.update).not.toHaveBeenCalled()
    expect(prismaMock.travelDay.createMany).not.toHaveBeenCalled()
  })

  it('区间变短且首日也变了 → 只对齐区间内的那些天', async () => {
    prismaMock.travelDay.findMany.mockResolvedValue([
      dayRow(1, d(2026, 8, 31)),
      dayRow(2, d(2026, 9, 1)),
      dayRow(3, d(2026, 9, 2)),
    ])
    const changed = await syncTravelDayDates(7, d(2026, 7, 27), d(2026, 7, 27))
    expect(changed).toBe(1)
    expect(prismaMock.travelDay.update).toHaveBeenCalledTimes(1)
    expect(prismaMock.travelDay.createMany).not.toHaveBeenCalled()
  })

  it('没有开始日且一天都没有 → 至少补出 1 天', async () => {
    prismaMock.travelDay.findMany.mockResolvedValue([])
    prismaMock.travelDay.count.mockResolvedValue(0)
    const changed = await syncTravelDayDates(7, null, null)
    expect(changed).toBe(1)
    expect(prismaMock.travelDay.createMany).toHaveBeenCalledTimes(1)
  })

  it('没有开始日但已有天 → 不动（无法对齐）', async () => {
    prismaMock.travelDay.findMany.mockResolvedValue([dayRow(1, d(2026, 8, 31))])
    const changed = await syncTravelDayDates(7, null, null)
    expect(changed).toBe(0)
    expect(prismaMock.travelDay.createMany).not.toHaveBeenCalled()
  })

  it('区间上限 60 天（防止误填超长区间产生海量空天）', async () => {
    prismaMock.travelDay.findMany.mockResolvedValue([])
    const changed = await syncTravelDayDates(7, d(2026, 1, 1), d(2026, 12, 31))
    expect(changed).toBe(60)
    const created = (prismaMock.travelDay.createMany.mock.calls[0][0] as any).data
    expect(created).toHaveLength(60)
  })
})

describe('makeUniqueTravelSlug', () => {
  it('未占用时原样返回', async () => {
    prismaMock.travel.findFirst.mockResolvedValue(null)
    expect(await makeUniqueTravelSlug('南京之行')).toBe('南京之行')
  })

  it('已占用时追加序号（同名旅行是常态，不能让 create 撞唯一约束）', async () => {
    prismaMock.travel.findFirst
      .mockResolvedValueOnce({ id: 1 }) // 南京之行 被占
      .mockResolvedValueOnce({ id: 2 }) // 南京之行-2 被占
      .mockResolvedValueOnce(null) // 南京之行-3 可用
    expect(await makeUniqueTravelSlug('南京之行')).toBe('南京之行-3')
  })

  it('编辑场景排除自己（只改日期不该被判重复）', async () => {
    prismaMock.travel.findFirst.mockResolvedValue(null)
    await makeUniqueTravelSlug('南京之行', 42)
    const where = (prismaMock.travel.findFirst.mock.calls[0][0] as any).where
    expect(where.id).toEqual({ not: 42 })
  })
})

describe('updateTravelInfo', () => {
  it('结束日早于开始日 → 拒绝（不让负天数流到「天」生成）', async () => {
    prismaMock.travel.findUnique.mockResolvedValue({
      title: '南京之行',
      slug: '南京之行',
      startDate: null,
      endDate: null,
    })
    await expect(
      updateTravelInfo(1, { startDate: '2026-09-10', endDate: '2026-09-01' }),
    ).rejects.toThrow('结束日期不能早于开始日')
    expect(prismaMock.travel.update).not.toHaveBeenCalled()
  })

  it('改标题 → slug 跟着重算并回传（前台据此换地址）', async () => {
    prismaMock.travel.findUnique.mockResolvedValue({
      title: '旧名字',
      slug: '旧名字',
      startDate: null,
      endDate: null,
    })
    const r = await updateTravelInfo(1, { title: '新名字' })
    expect(r.slug).toBe('新名字')
    const data = (prismaMock.travel.update.mock.calls[0][0] as any).data
    expect(data.title).toBe('新名字')
    expect(data.slug).toBe('新名字')
  })

  it('标题不变 → 不重算 slug（避免无意义改名导致链接失效）', async () => {
    prismaMock.travel.findUnique.mockResolvedValue({
      title: '南京之行',
      slug: '南京之行',
      startDate: null,
      endDate: null,
    })
    const r = await updateTravelInfo(1, { location: '苏州' })
    expect(r.slug).toBe('南京之行')
    const data = (prismaMock.travel.update.mock.calls[0][0] as any).data
    expect(data.slug).toBeUndefined()
    expect(data.location).toBe('苏州')
  })

  it('空标题 → 拒绝（旅行必须有名字，列表与画册都靠它）', async () => {
    prismaMock.travel.findUnique.mockResolvedValue({
      title: '南京之行',
      slug: '南京之行',
      startDate: null,
      endDate: null,
    })
    await expect(updateTravelInfo(1, { title: '   ' })).rejects.toThrow('旅行名称不能为空')
  })
})
