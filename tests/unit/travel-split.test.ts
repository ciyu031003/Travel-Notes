import { describe, it, expect, vi } from 'vitest'

/**
 * P2-32 拆分产物（travel.mapper.ts / travel.policy.ts）的纯函数回归。
 *
 * 这些函数原来是 travel.service 里的内联逻辑，拆分时必须**行为不变**；
 * 单独测它们的价值在于：日期计划/字段归一这些"算错就静默错"的地方，
 * 不用再靠 mock 整条 prisma 调用链才能覆盖。
 */

// policy 依赖 prisma（slug 唯一化 / 权限判定）；本文件只测纯函数，给个空壳避免真实连库
vi.mock('@/lib/db', () => ({ prisma: {} }))

import {
  mapExpenseList,
  mapTravelDetail,
  mapTravelPublicDetail,
  mapTravelSummary,
  safeParseTags,
} from '@/lib/modules/travel/travel.mapper'
import {
  dayTitle,
  normalizeBudgetLoose,
  normalizeBudgetStrict,
  normalizeItineraryType,
  normalizeTravelTitle,
  parseTimeOrDate,
  planDayAlignment,
  planDaySpan,
  planTravelDayDates,
} from '@/lib/modules/travel/travel.policy'

/** 本地零点（与 policy 内部一致，避免时区把断言挪一天） */
function d(y: number, m: number, day: number) {
  return new Date(y, m - 1, day)
}
const dayStr = (x: Date) => x.toDateString()

describe('parseTimeOrDate：行程时间按「墙上时间」存 UTC 基准日', () => {
  it('"17:00" → 1970-01-01T17:00Z（任何时区读回都是 17:00）', () => {
    expect(parseTimeOrDate('17:00')!.toISOString()).toBe('1970-01-01T17:00:00.000Z')
  })

  it('兼容 HH:mm:ss 与越界归零（防止 25:99 之类的脏值进库）', () => {
    expect(parseTimeOrDate('09:30:15')!.toISOString()).toBe('1970-01-01T09:30:15.000Z')
    expect(parseTimeOrDate('25:99')!.toISOString()).toBe('1970-01-01T23:59:00.000Z')
  })

  it('空值 / 非时间串 → null；合法日期串原样解析', () => {
    expect(parseTimeOrDate('')).toBeNull()
    expect(parseTimeOrDate(null)).toBeNull()
    expect(parseTimeOrDate('not-a-date')).toBeNull()
    expect(parseTimeOrDate('2026-05-01')!.toISOString().startsWith('2026-05-01')).toBe(true)
  })
})

describe('planTravelDayDates：天数生成计划', () => {
  it('含首尾：5/1–5/3 → 3 个本地零点', () => {
    const dates = planTravelDayDates('2026-05-01', '2026-05-03')
    expect(dates).toHaveLength(3)
    expect(dates.map(dayStr)).toEqual([d(2026, 5, 1), d(2026, 5, 2), d(2026, 5, 3)].map(dayStr))
    expect(dates.every((x) => x.getHours() === 0)).toBe(true)
  })

  it('未填开始日 / 区间倒置 → 空数组（由调用方兜底成 1 天）', () => {
    expect(planTravelDayDates()).toEqual([])
    expect(planTravelDayDates(null, '2026-05-03')).toEqual([])
    expect(planTravelDayDates('2026-05-03', '2026-05-01')).toEqual([])
  })

  it('上限 60 天（防误填超长区间产生海量空天）', () => {
    expect(planTravelDayDates('2026-01-01', '2026-12-31')).toHaveLength(60)
  })
})

describe('planDayAlignment：天日期对齐计划（就地改，不删天）', () => {
  const rows = [
    { id: 1, date: d(2026, 8, 31), sortOrder: 0 },
    { id: 2, date: d(2026, 9, 1), sortOrder: 1 },
    { id: 3, date: d(2026, 9, 2), sortOrder: 2 },
  ]

  it('已对齐 → 不产生任何写（避免无意义的 UPDATE）', () => {
    const plan = planDayAlignment(rows, d(2026, 8, 31), d(2026, 9, 2))
    expect(plan.updates).toEqual([])
    expect(plan.extraDates).toEqual([])
  })

  it('开始日变化 → 每天都就地改到新区间', () => {
    const plan = planDayAlignment(rows, d(2026, 7, 27), d(2026, 7, 29))
    expect(plan.updates.map((u) => u.id)).toEqual([1, 2, 3])
    expect(plan.updates.map((u) => dayStr(u.date))).toEqual(
      [d(2026, 7, 27), d(2026, 7, 28), d(2026, 7, 29)].map(dayStr),
    )
    expect(plan.extraDates).toEqual([])
  })

  it('区间变长 → 补出缺失的天；变短 → 保留多出来的天（不删，可能已有照片）', () => {
    const longer = planDayAlignment([rows[0]], d(2026, 8, 31), d(2026, 9, 2))
    expect(longer.extraDates.map(dayStr)).toEqual([d(2026, 9, 1), d(2026, 9, 2)].map(dayStr))

    const shorter = planDayAlignment(rows, d(2026, 8, 31), d(2026, 8, 31))
    expect(shorter.updates).toEqual([])
    expect(shorter.extraDates).toEqual([])
  })

  it('planDaySpan 含首尾且上限 60', () => {
    expect(planDaySpan(d(2026, 5, 1), d(2026, 5, 1))).toBe(1)
    expect(planDaySpan(d(2026, 5, 1), d(2026, 5, 3))).toBe(3)
    expect(planDaySpan(d(2026, 1, 1), d(2026, 12, 31))).toBe(60)
  })
})

describe('写路径归一化（原 travel.service 内联逻辑）', () => {
  it('dayTitle：两位补零，序号从 1 起', () => {
    expect(dayTitle(0)).toBe('DAY 01')
    expect(dayTitle(9)).toBe('DAY 10')
    expect(dayTitle(59)).toBe('DAY 60')
  })

  it('normalizeTravelTitle：空白/超长拒绝，正常值 trim', () => {
    expect(normalizeTravelTitle('  南京之行 ')).toBe('南京之行')
    expect(() => normalizeTravelTitle('   ')).toThrow('旅行名称不能为空')
    expect(() => normalizeTravelTitle('x'.repeat(121))).toThrow('旅行名称过长')
  })

  it('normalizeBudgetStrict 抛错、normalizeBudgetLoose 静默丢弃非法值', () => {
    expect(normalizeBudgetStrict(null)).toBeNull()
    expect(normalizeBudgetStrict(1234.5)).toBe(1234.5)
    expect(() => normalizeBudgetStrict(-1)).toThrow('预算需为不小于 0 的数字')
    expect(() => normalizeBudgetStrict(Number.NaN)).toThrow('预算需为不小于 0 的数字')
    expect(() => normalizeBudgetStrict(100_000_001)).toThrow('预算数值过大')

    expect(normalizeBudgetLoose(null)).toBeNull()
    expect(normalizeBudgetLoose('88')).toBe(88)
    expect(normalizeBudgetLoose(-1)).toBe('invalid')
    expect(normalizeBudgetLoose('abc')).toBe('invalid')
  })

  it('normalizeItineraryType：未知值落 SPOT（脏值不能进库）', () => {
    expect(normalizeItineraryType('HOTEL')).toBe('HOTEL')
    expect(normalizeItineraryType('SPACESHIP')).toBe('SPOT')
    expect(normalizeItineraryType(undefined)).toBe('SPOT')
  })
})

describe('读模型映射（原 listTravels / getTravelDetail / getTravelBySlug 内联逻辑）', () => {
  const thumb = (k: string) => ({ variant: 'THUMBNAIL', storageKey: k })
  const summaryRow = {
    id: 1,
    title: '南京行',
    slug: 'nanjing',
    description: null,
    startDate: new Date('2026-05-01T00:00:00.000Z'),
    endDate: null,
    status: 'COMPLETED',
    cover: '/uploads/legacy-cover.jpg',
    coverMediaId: 77,
    coverMedia: { storageKey: 'cover.jpg', variants: [thumb('cover-thumb.jpg')] },
    tags: '["情侣","周末"]',
    location: '南京',
    updatedAt: null,
    visibility: null,
    spaceId: null,
    ownerId: 7,
    confirmedAt: null,
    expenses: [{ amountCents: 1234 }, { amountCents: 100 }],
    _count: { days: 2 },
    days: [
      {
        memories: [
          { media: [{ storageKey: 'a.jpg', variants: [thumb('a-thumb.jpg')] }] },
          { media: [{ storageKey: 'b.jpg', variants: [] }] },
        ],
      },
    ],
  }

  it('mapTravelSummary：封面缩略图优先、照片去重、金额分→元、tags 解析、默认可见性', () => {
    const s = mapTravelSummary(summaryRow)
    expect(s.dayCount).toBe(2)
    expect(s.expenseTotal).toBe(13.34)
    expect(s.cover).toBe('/uploads/cover-thumb.jpg')
    expect(s.photos).toEqual(['/uploads/a-thumb.jpg', '/uploads/b.jpg'])
    expect(s.tags).toEqual(['情侣', '周末'])
    expect(s.visibility).toBe('SPACE')
    expect(s.startDate).toBe('2026-05-01T00:00:00.000Z')
    expect(s.coverMediaId).toBe(77)
  })

  it('mapTravelDetail：天 / 行程项 / 花销形状（含 locationName 与金额换算）', () => {
    const detail = mapTravelDetail({
      id: 2,
      title: '苏州',
      slug: 'suzhou',
      description: 'd',
      status: 'PLANNED',
      startDate: null,
      endDate: null,
      updatedAt: null,
      visibility: 'PRIVATE',
      spaceId: 3,
      ownerId: 7,
      days: [
        {
          id: 10,
          date: new Date('2026-05-01T00:00:00.000Z'),
          title: 'DAY 01',
          summary: null,
          sortOrder: 0,
          itineraryItems: [
            {
              id: 100,
              title: '高铁',
              startTime: new Date(Date.UTC(1970, 0, 1, 9, 0)),
              endTime: null,
              type: 'TRANSPORT',
              notes: null,
              location: { name: '南京南站' },
            },
          ],
        },
      ],
      expenses: [
        { id: 5, amountCents: 1999, currency: 'CNY', category: 'TRANSPORT', payer: null, note: null, happenedAt: null, itineraryItemId: 100 },
      ],
    })
    expect(detail.visibility).toBe('PRIVATE')
    expect(detail.days[0].itinerary[0].startTime).toBe('1970-01-01T09:00:00.000Z')
    expect(detail.days[0].itinerary[0].locationName).toBe('南京南站')
    expect(detail.expenses[0]).toMatchObject({ id: 5, amount: 19.99, itineraryItemId: 100 })
  })

  it('mapTravelPublicDetail：contentHtml 透传，非法预算视为未设置，travelType 兜底', () => {
    const p = mapTravelPublicDetail(
      {
        id: 3,
        title: '杭州',
        slug: 'hangzhou',
        description: null,
        startDate: null,
        endDate: null,
        status: 'COMPLETED',
        tags: null,
        location: '杭州',
        cover: null,
        coverMedia: null,
        coverMediaId: null,
        travelType: null,
        companions: null,
        budget: -5,
        confirmedAt: null,
      },
      '<p>hi</p>',
    )
    expect(p.contentHtml).toBe('<p>hi</p>')
    expect(p.budget).toBeNull()
    expect(p.travelType).toBe('ALONE')
    expect(p.coverUrl).toBeNull()
  })

  it('mapExpenseList：合计在整数分上求和后再换算', () => {
    const r = mapExpenseList([{ amountCents: 10 }, { amountCents: 20 }])
    expect(r.total).toBe(0.3)
    expect(r.expenses).toHaveLength(2)
  })

  it('safeParseTags：JSON 数组优先，历史逗号串回退', () => {
    expect(safeParseTags(null)).toBeNull()
    expect(safeParseTags('["a",1,"b"]')).toEqual(['a', 'b'])
    expect(safeParseTags('a, b ,c')).toEqual(['a', 'b', 'c'])
  })
})
