/**
 * 规划引擎单测（docs/plan-space-itinerary-engine.md §4.2 规则逐条覆盖）。
 *
 * 引擎是纯函数（无 IO / 无随机 / 无 Date.now），所以这里全部是确定性断言：
 * 天数边界、四种交通、三种节奏、兴趣注入、预算分配、单日合并、跨月跨年、Yjs 种子结构。
 */
import { describe, it, expect } from 'vitest'
import {
  buildItinerary,
  buildYjsSeed,
  normalizeInterests,
  MAX_ENGINE_DAYS,
  PLAN_INTERESTS,
  type PlanEngineInput,
  type PlanEngineItem,
} from '@/lib/modules/space/plan-engine'

const base: PlanEngineInput = {
  destination: '杭州',
  departureCity: '上海',
  startDate: '2026-12-06',
  endDate: '2026-12-08',
}

function flatten(days: ReturnType<typeof buildItinerary>['days']): PlanEngineItem[] {
  return days.flatMap((day) => day.items)
}

describe('buildItinerary · 天数（R1）', () => {
  it('含首尾日期差：12-06 ~ 12-08 是 3 天，日期连续', () => {
    const result = buildItinerary(base)
    expect(result.dayCount).toBe(3)
    expect(result.truncated).toBe(false)
    expect(result.days.map((d) => d.date)).toEqual(['2026-12-06', '2026-12-07', '2026-12-08'])
    expect(result.days.map((d) => d.sortOrder)).toEqual([1, 2, 3])
  })

  it('单日行程：一天里合并进/出交通 + 1 个活动（R5），不生成住宿块', () => {
    const result = buildItinerary({ ...base, endDate: '2026-12-06' })
    expect(result.dayCount).toBe(1)
    const kinds = result.days[0].items.map((item) => item.kind)
    expect(kinds.filter((k) => k === 'TRANSPORT')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'ACTIVITY')).toHaveLength(1)
    expect(kinds.includes('HOTEL')).toBe(false)
    expect(result.days[0].items).toHaveLength(3)
  })

  it('两天：第 1 天 + 最后一天，没有中间天', () => {
    const result = buildItinerary({ ...base, endDate: '2026-12-07' })
    expect(result.dayCount).toBe(2)
    expect(result.days[0].title).toBe('抵达杭州')
    expect(result.days[1].title).toBe('返程')
  })

  it('7 天：中间天 = 5 天，每天都至少 1 块', () => {
    const result = buildItinerary({ ...base, endDate: '2026-12-12' })
    expect(result.dayCount).toBe(7)
    expect(result.days[0].title).toBe('抵达杭州')
    expect(result.days[6].title).toBe('返程')
    for (const day of result.days) {
      expect(day.items.length).toBeGreaterThanOrEqual(1)
      expect(day.items.every((item) => item.title.trim().length > 0)).toBe(true)
    }
  })

  it('超过 30 天：只生成前 30 天并标记 truncated（R1）', () => {
    const result = buildItinerary({ ...base, endDate: '2027-02-28' })
    expect(result.dayCount).toBe(MAX_ENGINE_DAYS)
    expect(result.days).toHaveLength(MAX_ENGINE_DAYS)
    expect(result.truncated).toBe(true)
    expect(result.requestedDayCount).toBeGreaterThan(MAX_ENGINE_DAYS)
  })

  it('正好 30 天：不标记 truncated', () => {
    const result = buildItinerary({ destination: '杭州', startDate: '2026-12-01', endDate: '2026-12-30' })
    expect(result.dayCount).toBe(30)
    expect(result.truncated).toBe(false)
  })

  it('跨月 / 跨年日期正确递增', () => {
    const crossMonth = buildItinerary({ ...base, startDate: '2026-01-30', endDate: '2026-02-02' })
    expect(crossMonth.days.map((d) => d.date)).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02'])
    const crossYear = buildItinerary({ ...base, startDate: '2026-12-30', endDate: '2027-01-02' })
    expect(crossYear.days.map((d) => d.date)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
  })

  it('ISO 时间串（带时间部分）只取日期', () => {
    const result = buildItinerary({ ...base, startDate: '2026-12-06T00:00:00.000Z', endDate: '2026-12-07T00:00:00.000Z' })
    expect(result.days[0].date).toBe('2026-12-06')
  })

  it('非法输入抛中文提示', () => {
    expect(() => buildItinerary({ ...base, endDate: '2026-12-01' })).toThrow('结束日期不能早于开始日期')
    expect(() => buildItinerary({ ...base, destination: '  ' })).toThrow('目的地不能为空')
    expect(() => buildItinerary({ ...base, startDate: '2026-13-01' })).toThrow('开始日期格式不正确')
    expect(() => buildItinerary({ ...base, startDate: '2026-02-30' })).toThrow('开始日期格式不正确')
  })
})

describe('buildItinerary · 第 1 天与最后一天（R2 / R4）', () => {
  it('第 1 天：交通 09:00 → 15:00 入住 → 18:30 晚餐', () => {
    const day1 = buildItinerary(base).days[0]
    expect(day1.items.map((item) => item.kind)).toEqual(['TRANSPORT', 'HOTEL', 'FOOD'])
    expect(day1.items[0].startAt).toBe('2026-12-06T09:00')
    expect(day1.items[1].startAt).toBe('2026-12-06T15:00')
    expect(day1.items[2].startAt).toBe('2026-12-06T18:30')
    expect(day1.items[0].title).toBe('上海 → 杭州（高铁）')
    expect(day1.items[1].title).toBe('入住 杭州 酒店')
    expect(day1.items[2].title).toBe('找一家本地菜')
  })

  it('到达早于 12:00（航班 11:20）插入 FLEX 轻松散步', () => {
    const day1 = buildItinerary({ ...base, transportMode: 'FLIGHT' }).days[0]
    expect(day1.items.map((item) => item.kind)).toEqual(['TRANSPORT', 'FLEX', 'HOTEL', 'FOOD'])
    expect(day1.items[1].title).toBe('到了先散散步')
  })

  it('到达不早于 12:00（高铁 12:20）不插 FLEX', () => {
    const day1 = buildItinerary({ ...base, transportMode: 'TRAIN' }).days[0]
    expect(day1.items.some((item) => item.kind === 'FLEX')).toBe(false)
  })

  it('最后一天：早餐 → 11:00 退房 → 14:00 返程（方向反转）', () => {
    const last = buildItinerary(base).days[2]
    expect(last.title).toBe('返程')
    expect(last.items.map((item) => item.kind)).toEqual(['FOOD', 'HOTEL', 'TRANSPORT'])
    expect(last.items[1].startAt).toBe('2026-12-08T11:00')
    expect(last.items[2].startAt).toBe('2026-12-08T14:00')
    expect(last.items[2].title).toBe('杭州 → 上海（高铁）')
  })

  it('出发地缺失时留「待定出发地」占位', () => {
    const result = buildItinerary({ destination: '大理', startDate: '2026-12-06', endDate: '2026-12-08' })
    expect(result.days[0].items[0].title).toBe('待定出发地 → 大理（高铁）')
    expect(result.days[2].items[2].title).toBe('大理 → 待定出发地（高铁）')
  })
})

describe('buildItinerary · 交通方式（R2）', () => {
  it.each([
    ['FLIGHT', '航班', '2026-12-06T11:20'],
    ['TRAIN', '高铁', '2026-12-06T12:20'],
    ['DRIVE', '自驾', '2026-12-06T13:00'],
    ['MIXED', '高铁 + 当地交通', '2026-12-06T12:30'],
  ])('%s：标题含「%s」，到达 %s', (mode, label, arrive) => {
    const day1 = buildItinerary({ ...base, transportMode: mode }).days[0]
    expect(day1.items[0].title).toContain(label)
    expect(day1.items[0].endAt).toBe(arrive)
  })

  it('未知交通方式回落 TRAIN（默认）', () => {
    const day1 = buildItinerary({ ...base, transportMode: 'ROCKET' as never }).days[0]
    expect(day1.items[0].title).toBe('上海 → 杭州（高铁）')
  })
})

describe('buildItinerary · 中间天与节奏（R3）', () => {
  const middle = (pace?: string) =>
    buildItinerary({ ...base, endDate: '2026-12-09', pace }).days.slice(1, 3)

  it('RELAXED：每天 3 块（早 / 主活动 / 晚）', () => {
    for (const day of middle('RELAXED')) {
      expect(day.items).toHaveLength(3)
      expect(day.items.map((item) => item.kind)).toEqual(['FOOD', 'SPOT', 'FOOD'])
    }
  })

  it('STANDARD（默认）：每天 4 块（早 / 上午 / 下午 / 晚）', () => {
    for (const day of middle()) {
      expect(day.items).toHaveLength(4)
      expect(day.items.map((item) => item.kind)).toEqual(['FOOD', 'SPOT', 'ACTIVITY', 'FOOD'])
    }
  })

  it('PACKED：每天 6 块（含午餐与夜生活）', () => {
    for (const day of middle('PACKED')) {
      expect(day.items).toHaveLength(6)
      expect(day.items.map((item) => item.kind)).toEqual(['FOOD', 'SPOT', 'FOOD', 'ACTIVITY', 'FOOD', 'ACTIVITY'])
      expect(day.items[5].startAt).toContain('T21:00')
    }
  })

  it('兴趣注入占位文案：美食 → 小馆（FOOD）、自然 → 徒步、人文 → 博物馆', () => {
    const food = middle('STANDARD')[0]
    const withFood = buildItinerary({ ...base, endDate: '2026-12-09', interests: ['美食'] }).days[1]
    expect(withFood.items[1].title).toBe('本地人推荐的小馆')
    expect(withFood.items[1].kind).toBe('FOOD')
    const withNature = buildItinerary({ ...base, endDate: '2026-12-09', interests: ['自然'] }).days[1]
    expect(withNature.items[1].title).toBe('近郊徒步 / 湖边')
    const withCulture = buildItinerary({ ...base, endDate: '2026-12-09', interests: ['人文'] }).days[1]
    expect(withCulture.items[1].title).toBe('博物馆 / 老街')
    expect(food.items[1].title.length).toBeGreaterThan(0)
  })

  it('多兴趣按天轮转（Day2 用第 1 个，Day3 用第 2 个）', () => {
    const days = buildItinerary({ ...base, endDate: '2026-12-10', interests: ['自然', '人文'] }).days
    expect(days[1].items[1].title).toBe('近郊徒步 / 湖边')
    expect(days[2].items[1].title).toBe('博物馆 / 老街')
    expect(days[1].title).toBe('自然慢走')
    expect(days[2].title).toBe('人文漫游')
  })

  it('没有兴趣时用默认主活动占位', () => {
    const day = middle()[0]
    expect(day.items[1].title).toBe('挑一个最想去的地方')
    expect(day.title).toBe('自由安排')
  })

  it('normalizeInterests：白名单过滤 + 去重 + 保序', () => {
    expect(normalizeInterests(['美食', '美食', '外星', '自然'])).toEqual(['美食', '自然'])
    expect(normalizeInterests(null)).toEqual([])
    expect(normalizeInterests(PLAN_INTERESTS)).toHaveLength(PLAN_INTERESTS.length)
  })
})

describe('buildItinerary · 预算分配（R6）', () => {
  it('交通 35% / 住宿 30% / 餐饮 20% / 门票活动 15%', () => {
    const result = buildItinerary({ ...base, budget: 7000 })
    expect(result.budgetSplit).toEqual({ transport: 2450, hotel: 2100, food: 1400, ticket: 1050 })
  })

  it('两位小数四舍五入；无预算/0 → null', () => {
    expect(buildItinerary({ ...base, budget: 99.99 }).budgetSplit).toEqual({
      transport: 35,
      hotel: 30,
      food: 20,
      ticket: 15,
    })
    expect(buildItinerary(base).budgetSplit).toBeNull()
    expect(buildItinerary({ ...base, budget: 0 }).budgetSplit).toBeNull()
  })
})

describe('buildItinerary · 时间与排序', () => {
  it('每天块按开始时间升序，sortOrder 从 0 连续', () => {
    const result = buildItinerary({ ...base, transportMode: 'FLIGHT', pace: 'PACKED', endDate: '2026-12-10' })
    for (const day of result.days) {
      const starts = day.items.map((item) => item.startAt ?? '')
      const sorted = [...starts].sort()
      expect(starts).toEqual(sorted)
      expect(day.items.map((item) => item.sortOrder)).toEqual(day.items.map((_, index) => index))
    }
  })

  it('同一输入重复调用结果完全一致（确定性，可前端预览/服务端复用）', () => {
    const input: PlanEngineInput = { ...base, interests: ['美食', '夜生活'], pace: 'PACKED', budget: 3000, transportMode: 'DRIVE' }
    expect(buildItinerary(input)).toEqual(buildItinerary(input))
  })
})

describe('buildYjsSeed（docs/plan-p1-collab-spec.md §2）', () => {
  const itinerary = buildItinerary({ ...base, interests: ['自然'], budget: 5000 })

  it('days 是数组、items 是以 itemId 为 key 的映射，且 id 确定性可复现', () => {
    const seed = buildYjsSeed(itinerary, { departureCity: '上海', transportMode: 'TRAIN', pace: 'STANDARD', interests: ['自然'] })
    const again = buildYjsSeed(itinerary, { departureCity: '上海', transportMode: 'TRAIN', pace: 'STANDARD', interests: ['自然'] })
    expect(seed).toEqual(again)
    expect(seed.version).toBe(1)
    expect(seed.days).toHaveLength(3)
    expect(seed.days[0].id).toBe('d1')
    expect(seed.days[0].itemIds).toEqual(['d1i1', 'd1i2', 'd1i3'])
    expect(Object.keys(seed.items)).toHaveLength(flatten(itinerary.days).length)
  })

  it('每块的 dayId 指回所属天，mediaIds 初始为空，done 初始 false', () => {
    const seed = buildYjsSeed(itinerary)
    for (const day of seed.days) {
      for (const itemId of day.itemIds) {
        const item = seed.items[itemId]
        expect(item.dayId).toBe(day.id)
        expect(item.mediaIds).toEqual([])
        expect(item.done).toBe(false)
        expect(item.doneBy).toBeNull()
      }
    }
  })

  it('meta 带引擎输入与预算拆分', () => {
    const seed = buildYjsSeed(itinerary, { departureCity: '上海', transportMode: 'FLIGHT', pace: 'RELAXED', interests: ['自然'] })
    expect(seed.meta).toEqual({
      departureCity: '上海',
      transportMode: 'FLIGHT',
      pace: 'RELAXED',
      interests: ['自然'],
      budgetSplit: { transport: 1750, hotel: 1500, food: 1000, ticket: 750 },
      engineVersion: 1,
    })
  })
})
