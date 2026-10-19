import { describe, it, expect, vi, beforeEach } from 'vitest'

/** P3-39：travel.policy 的纯函数（日期计划/预算/标题）此前几乎无覆盖。 */
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    travel: { findFirst: vi.fn(), findUnique: vi.fn() },
    spaceMember: { findFirst: vi.fn() },
    media: { findUnique: vi.fn() },
    travelDay: { findUnique: vi.fn() },
    itineraryItem: { findUnique: vi.fn() },
    expense: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

import {
  ITINERARY_TYPES,
  normalizeItineraryType,
  MAX_TRAVEL_DAY_SPAN,
  parseTimeOrDate,
  localMidnight,
  localMidnightPlusDays,
  planTravelDayDates,
  planDaySpan,
  planDayAlignment,
  dayTitle,
  normalizeTravelTitle,
  normalizeBudgetStrict,
  normalizeBudgetLoose,
  makeUniqueTravelSlug,
  travelSlugBase,
  canManageTravel,
  assertCoverMediaBelongs,
  findTravelIdByDayId,
  findTravelIdByItineraryItemId,
  findTravelIdByExpenseId,
} from '@/lib/modules/travel/travel.policy'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('行程类型与时间解析', () => {
  it('normalizeItineraryType：白名单外一律 SPOT', () => {
    expect(ITINERARY_TYPES).toContain('SPOT')
    expect(normalizeItineraryType('RESTAURANT')).toBe('RESTAURANT')
    expect(normalizeItineraryType('nope')).toBe('SPOT')
    expect(normalizeItineraryType(null)).toBe('SPOT')
    expect(normalizeItineraryType(undefined)).toBe('SPOT')
  })

  it('parseTimeOrDate：HH:mm 按 UTC 墙上时间，越界夹取，非法返回 null', () => {
    const t = parseTimeOrDate('17:30')!
    expect(t.getUTCHours()).toBe(17)
    expect(t.getUTCMinutes()).toBe(30)

    const clamped = parseTimeOrDate('99:99:99')!
    expect(clamped.getUTCHours()).toBe(23)
    expect(clamped.getUTCMinutes()).toBe(59)
    expect(clamped.getUTCSeconds()).toBe(59)

    expect(parseTimeOrDate('')).toBeNull()
    expect(parseTimeOrDate(null)).toBeNull()
    expect(parseTimeOrDate('not-a-date')).toBeNull()
    expect(parseTimeOrDate('2026-10-19T00:00:00Z')!.toISOString()).toBe('2026-10-19T00:00:00.000Z')
  })
})

describe('日期计划', () => {
  it('localMidnight / localMidnightPlusDays 去时分秒并跨月', () => {
    const d = localMidnight(new Date(2026, 9, 19, 13, 45, 30))
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0])
    const next = localMidnightPlusDays(new Date(2026, 9, 31), 1)
    expect(next.getMonth()).toBe(10)
    expect(next.getDate()).toBe(1)
  })

  it('planTravelDayDates：无/非法开始日 → []，倒置区间 → []', () => {
    expect(planTravelDayDates()).toEqual([])
    expect(planTravelDayDates(null, null)).toEqual([])
    expect(planTravelDayDates('bad-date')).toEqual([])
    expect(planTravelDayDates('2026-10-10', '2026-10-01')).toEqual([])
  })

  it('planTravelDayDates：含首尾、单日一天、超长区间按上限截断', () => {
    expect(planTravelDayDates('2026-10-01', '2026-10-03').length).toBe(3)
    expect(planTravelDayDates('2026-10-01', '2026-10-01').length).toBe(1)
    const long = planTravelDayDates('2026-01-01', '2026-12-31')
    expect(long.length).toBe(MAX_TRAVEL_DAY_SPAN)
  })

  it('planDaySpan：无结束日算 1 天，上限封顶', () => {
    expect(planDaySpan(new Date(2026, 9, 1), null)).toBe(1)
    expect(planDaySpan(new Date(2026, 9, 1), new Date(2026, 9, 3))).toBe(3)
    expect(planDaySpan(new Date(2026, 0, 1), new Date(2027, 0, 1))).toBe(MAX_TRAVEL_DAY_SPAN)
  })

  it('planDayAlignment：日期一致不发 UPDATE；变化就地对齐；变长补齐；变短保留多余天', () => {
    const start = new Date(2026, 9, 1)
    const same = planDayAlignment([
      { id: 1, date: new Date(2026, 9, 1), sortOrder: 0 },
      { id: 2, date: new Date(2026, 9, 2), sortOrder: 1 },
    ], start, new Date(2026, 9, 2))
    expect(same).toEqual({ updates: [], extraDates: [] })

    const changed = planDayAlignment([
      { id: 1, date: null, sortOrder: 0 },
      { id: 2, date: new Date(2026, 9, 2), sortOrder: 1 },
    ], start, new Date(2026, 9, 2))
    expect(changed.updates.map((u) => u.id)).toEqual([1])
    expect(changed.updates[0].date.toDateString()).toBe(start.toDateString())

    const longer = planDayAlignment([{ id: 1, date: start, sortOrder: 0 }], start, new Date(2026, 9, 3))
    expect(longer.extraDates.length).toBe(2)

    const shorter = planDayAlignment([
      { id: 1, date: start, sortOrder: 0 },
      { id: 2, date: new Date(2026, 9, 2), sortOrder: 1 },
      { id: 3, date: new Date(2026, 9, 3), sortOrder: 2 },
    ], start, start)
    expect(shorter.updates).toEqual([])
    expect(shorter.extraDates).toEqual([])
  })

  it('dayTitle：DAY 01 起、两位补零', () => {
    expect(dayTitle(0)).toBe('DAY 01')
    expect(dayTitle(9)).toBe('DAY 10')
  })
})

describe('标题与预算归一', () => {
  it('normalizeTravelTitle：trim 后返回，空/超长抛业务错误', () => {
    expect(normalizeTravelTitle('  南京之行  ')).toBe('南京之行')
    expect(() => normalizeTravelTitle('   ')).toThrow('旅行名称不能为空')
    expect(() => normalizeTravelTitle('x'.repeat(121))).toThrow('旅行名称过长')
  })

  it('normalizeBudgetStrict：null 通过，负数/非有限/超上限抛错', () => {
    expect(normalizeBudgetStrict(null)).toBeNull()
    expect(normalizeBudgetStrict(0)).toBe(0)
    expect(() => normalizeBudgetStrict(-1)).toThrow('预算需为不小于 0 的数字')
    expect(() => normalizeBudgetStrict(Number.NaN)).toThrow('预算需为不小于 0 的数字')
    expect(() => normalizeBudgetStrict(100_000_001)).toThrow('预算数值过大')
  })

  it('normalizeBudgetLoose：非法返回 invalid（调用方静默丢弃）', () => {
    expect(normalizeBudgetLoose(null)).toBeNull()
    expect(normalizeBudgetLoose('12.5')).toBe(12.5)
    expect(normalizeBudgetLoose('abc')).toBe('invalid')
    expect(normalizeBudgetLoose(-1)).toBe('invalid')
    expect(normalizeBudgetLoose(100_000_001)).toBe('invalid')
  })

  it('travelSlugBase 复用 makeTravelSlug', () => {
    expect(typeof travelSlugBase('南京之行')).toBe('string')
    expect(travelSlugBase('Kyoto Trip')).toContain('kyoto')
  })
})

describe('slug 唯一化与子资源归属（mock DB）', () => {
  it('makeUniqueTravelSlug：首次不冲突直接返回', async () => {
    prismaMock.travel.findFirst.mockResolvedValue(null)
    await expect(makeUniqueTravelSlug('nanjing')).resolves.toBe('nanjing')
  })

  it('makeUniqueTravelSlug：冲突时追加 -2', async () => {
    prismaMock.travel.findFirst
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce(null)
    await expect(makeUniqueTravelSlug('nanjing')).resolves.toBe('nanjing-2')
  })

  it('makeUniqueTravelSlug：50 次都冲突时用时间戳兜底', async () => {
    prismaMock.travel.findFirst.mockResolvedValue({ id: 1 })
    const slug = await makeUniqueTravelSlug('dup')
    expect(slug.startsWith('dup-')).toBe(true)
    expect(prismaMock.travel.findFirst).toHaveBeenCalledTimes(50)
  })

  it('canManageTravel：未登录/不存在/非成员均 false，owner 或空间成员 true', async () => {
    expect(await canManageTravel(1, null)).toBe(false)
    prismaMock.travel.findUnique.mockResolvedValue(null)
    expect(await canManageTravel(1, 2)).toBe(false)
    prismaMock.travel.findUnique.mockResolvedValue({ ownerId: 2, spaceId: null })
    expect(await canManageTravel(1, 2)).toBe(true)
    prismaMock.travel.findUnique.mockResolvedValue({ ownerId: 9, spaceId: 5 })
    prismaMock.spaceMember.findFirst.mockResolvedValue({ id: 1 })
    expect(await canManageTravel(1, 2)).toBe(true)
    prismaMock.spaceMember.findFirst.mockResolvedValue(null)
    expect(await canManageTravel(1, 2)).toBe(false)
  })

  it('assertCoverMediaBelongs：照片不存在/不属于该旅行均抛错，主照片或关联路径命中通过', async () => {
    prismaMock.media.findUnique.mockResolvedValue(null)
    await expect(assertCoverMediaBelongs(1, 2)).rejects.toThrow('照片不存在')

    prismaMock.media.findUnique.mockResolvedValue({ memory: { travelId: 9 }, memoryLinks: [] })
    await expect(assertCoverMediaBelongs(1, 2)).rejects.toThrow('这张照片不属于该旅行')

    prismaMock.media.findUnique.mockResolvedValue({ memory: { travelId: 1 }, memoryLinks: [] })
    await expect(assertCoverMediaBelongs(1, 2)).resolves.toBeUndefined()

    prismaMock.media.findUnique.mockResolvedValue({ memory: null, memoryLinks: [{ memory: { travelId: 1 } }] })
    await expect(assertCoverMediaBelongs(1, 2)).resolves.toBeUndefined()
  })

  it('由子资源反查旅行 ID', async () => {
    prismaMock.travelDay.findUnique.mockResolvedValue({ travelId: 3 })
    await expect(findTravelIdByDayId(1)).resolves.toBe(3)
    prismaMock.travelDay.findUnique.mockResolvedValue(null)
    await expect(findTravelIdByDayId(1)).resolves.toBeNull()

    prismaMock.itineraryItem.findUnique.mockResolvedValue({ travelDay: { travelId: 4 } })
    await expect(findTravelIdByItineraryItemId(1)).resolves.toBe(4)
    prismaMock.itineraryItem.findUnique.mockResolvedValue(null)
    await expect(findTravelIdByItineraryItemId(1)).resolves.toBeNull()

    prismaMock.expense.findUnique.mockResolvedValue({ travelId: 5 })
    await expect(findTravelIdByExpenseId(1)).resolves.toBe(5)
    prismaMock.expense.findUnique.mockResolvedValue(null)
    await expect(findTravelIdByExpenseId(1)).resolves.toBeNull()
  })
})
