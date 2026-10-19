import { describe, it, expect } from 'vitest'
import {
  safeParseTags,
  iso,
  isoBudget,
  mapTravelSummary,
  mapTravelList,
  mapTravelDetail,
  mapExpenseRecords,
  mapExpenseList,
  mapTravelTimelineDays,
  mapTravelPublicDetail,
} from '@/lib/modules/travel/travel.mapper'

/** P3-39：travel.mapper 是纯映射函数（无 DB），此前无直接单测。 */
describe('safeParseTags', () => {
  it('空值 → null', () => {
    expect(safeParseTags(null)).toBeNull()
    expect(safeParseTags('')).toBeNull()
    expect(safeParseTags(undefined)).toBeNull()
  })

  it('JSON 数组仅保留字符串元素', () => {
    expect(safeParseTags('["a","b"]')).toEqual(['a', 'b'])
    expect(safeParseTags('["a",1,null]')).toEqual(['a'])
  })

  it('非数组 JSON / 非法 JSON 回落逗号分隔', () => {
    expect(safeParseTags('{"a":1}')).toBeNull()
    expect(safeParseTags('a, b , ,c')).toEqual(['a', 'b', 'c'])
  })
})

describe('iso / isoBudget', () => {
  it('iso：Date/可解析值 → ISO；空/非法 → null', () => {
    const d = new Date('2026-10-19T00:00:00Z')
    expect(iso(d)).toBe('2026-10-19T00:00:00.000Z')
    expect(iso('2026-10-19T00:00:00Z' as unknown as Date)).toBe('2026-10-19T00:00:00.000Z')
    expect(iso(null)).toBeNull()
    expect(iso(undefined)).toBeNull()
    expect(iso('bad' as unknown as Date)).toBeNull()
  })

  it('isoBudget：非有限/负数 → null，数字字符串归一', () => {
    expect(isoBudget('12.5')).toBe(12.5)
    expect(isoBudget(0)).toBe(0)
    expect(isoBudget(-1)).toBeNull()
    expect(isoBudget('abc')).toBeNull()
    expect(isoBudget(undefined)).toBeNull()
  })
})

describe('mapTravelSummary / mapTravelList', () => {
  const row = {
    id: 1,
    title: '京都之行',
    slug: 'kyoto',
    description: 'desc',
    startDate: new Date('2026-04-01T00:00:00Z'),
    endDate: null,
    status: 'PLANNED',
    _count: { days: 3 },
    expenses: [{ amountCents: 1234 }, { amountCents: 66 }],
    coverMedia: { storageKey: 'media/cover.jpg', variants: [{ variant: 'THUMBNAIL', storageKey: 'media/cover-thumb.jpg' }] },
    coverMediaId: 9,
    cover: '/legacy-cover.jpg',
    tags: '["京都","樱花"]',
    location: '京都',
    updatedAt: new Date('2026-04-02T00:00:00Z'),
    visibility: undefined,
    spaceId: null,
    ownerId: 2,
    confirmedAt: null,
    days: [
      {
        memories: [
          {
            media: [
              { storageKey: 'media/a.jpg', variants: [{ variant: 'THUMBNAIL', storageKey: 'media/a-thumb.jpg' }] },
              { storageKey: 'media/b.jpg', variants: [] },
            ],
          },
        ],
      },
      {
        memories: [
          // 与上一天重复的照片应去重
          { media: [{ storageKey: 'media/a.jpg', variants: [{ variant: 'THUMBNAIL', storageKey: 'media/a-thumb.jpg' }] }] },
        ],
      },
    ],
  }

  it('汇总照片（缩略图优先 + 去重）、封面、花费合计（分→元）、默认可见性', () => {
    const dto = mapTravelSummary(row)
    expect(dto.photos).toEqual(['/uploads/media/a-thumb.jpg', '/uploads/media/b.jpg'])
    expect(dto.cover).toBe('/uploads/media/cover-thumb.jpg')
    expect(dto.expenseTotal).toBe(13)
    expect(dto.dayCount).toBe(3)
    expect(dto.visibility).toBe('SPACE')
    expect(dto.tags).toEqual(['京都', '樱花'])
    expect(dto.startDate).toBe('2026-04-01T00:00:00.000Z')
    expect(dto.endDate).toBeNull()
    expect(mapTravelList([row])).toHaveLength(1)
  })

  it('无 coverMedia 时回退 legacy cover', () => {
    const dto = mapTravelSummary({ ...row, coverMedia: null, coverMediaId: null, tags: null, days: [], expenses: [] })
    expect(dto.cover).toBe('/legacy-cover.jpg')
    expect(dto.photos).toEqual([])
    expect(dto.expenseTotal).toBe(0)
    expect(dto.tags).toBeNull()
  })
})

describe('mapTravelDetail / mapExpenseRecords / mapExpenseList', () => {
  it('详情映射：天、行程项、花销、默认值', () => {
    const detail = mapTravelDetail({
      id: 1, title: 'T', slug: 's', description: null,
      startDate: new Date('2026-04-01T00:00:00Z'), endDate: null, status: 'COMPLETED',
      updatedAt: new Date('2026-04-02T00:00:00Z'),
      days: [{
        id: 11, date: new Date('2026-04-01T00:00:00Z'), title: '第一天', summary: null, sortOrder: 0,
        itineraryItems: [{ id: 21, title: '清水寺', startTime: new Date('1970-01-01T09:00:00Z'), endTime: null, type: 'SPOT', notes: 'notes', location: { name: '京都' } }],
      }],
      expenses: [{ id: 31, amountCents: 500, currency: 'CNY', category: 'FOOD', payer: 'me', note: null, happenedAt: null, itineraryItemId: 21 }],
      visibility: 'PUBLIC', spaceId: 3, ownerId: 2,
    })
    expect(detail.days[0].itinerary[0]).toMatchObject({ title: '清水寺', locationName: '京都' })
    expect(detail.expenses[0]).toMatchObject({ amount: 5, itineraryItemId: 21 })
    expect(detail.visibility).toBe('PUBLIC')
    expect(detail.spaceId).toBe(3)
  })

  it('mapExpenseRecords / mapExpenseList 以整数分求和', () => {
    const rows = [
      { id: 1, amountCents: 199, currency: 'CNY', category: 'FOOD', payer: null, note: null, happenedAt: null },
      { id: 2, amountCents: 1, currency: 'CNY', category: 'OTHER', payer: null, note: null, happenedAt: null, itineraryItemId: null },
    ]
    expect(mapExpenseRecords(rows).map((e) => e.amount)).toEqual([1.99, 0.01])
    expect(mapExpenseList(rows).total).toBe(2)
    expect(mapExpenseList([]).total).toBe(0)
  })
})

describe('mapTravelTimelineDays', () => {
  it('回忆照片主关联 + 多对多关联合并去重；行程项带花销', () => {
    const days = [{
      id: 1, date: new Date('2026-04-01T00:00:00Z'), title: 'DAY 01', summary: null, sortOrder: 0,
      itineraryItems: [{
        id: 10, title: '午餐', startTime: null, endTime: null, type: 'RESTAURANT', notes: null,
        location: { name: '京都站' },
        expenses: [{ id: 20, amountCents: 1200, currency: 'CNY', category: 'FOOD', payer: null, note: null, happenedAt: null }],
      }],
      memories: [{
        id: 30, title: '回忆', content: 'c', mood: 'happy', happenedAt: null,
        media: [{ id: 1, storageKey: 'media/1.jpg', variants: [{ storageKey: 'media/1-thumb.jpg' }] }],
        mediaLinks: [{ media: { id: 1, storageKey: 'media/1.jpg', variants: [] } }, { media: { id: 2, storageKey: 'media/2.jpg', variants: [] } }],
      }],
    }]
    const timeline = mapTravelTimelineDays(days)
    expect(timeline[0].memories[0].photos.map((p) => p.id)).toEqual([1, 2])
    expect(timeline[0].photos.map((p) => p.id)).toEqual([1, 2])
    expect(timeline[0].itinerary[0].expenses[0].amount).toBe(12)
    expect(timeline[0].itinerary[0].locationName).toBe('京都站')
  })
})

describe('mapTravelPublicDetail', () => {
  it('封面缩略图优先、预算归一、travelType 默认 ALONE、contentHtml 原样带出', () => {
    const dto = mapTravelPublicDetail({
      id: 1, title: 'T', slug: 's', description: null,
      startDate: null, endDate: null, status: 'COMPLETED',
      coverMedia: { storageKey: 'media/c.jpg', variants: [{ variant: 'THUMBNAIL', storageKey: 'media/c-thumb.jpg' }] },
      tags: '["a"]', location: '京都', cover: '/old.jpg', coverMediaId: 3,
      travelType: undefined, companions: [{ name: 'a' }], budget: '1000', confirmedAt: new Date('2026-01-01T00:00:00Z'),
    }, '<p>html</p>')
    expect(dto.coverUrl).toBe('/uploads/media/c-thumb.jpg')
    expect(dto.travelType).toBe('ALONE')
    expect(dto.budget).toBe(1000)
    expect(dto.tags).toEqual(['a'])
    expect(dto.contentHtml).toBe('<p>html</p>')
  })
})
