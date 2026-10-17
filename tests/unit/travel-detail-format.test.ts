import { describe, it, expect } from 'vitest'
import {
  compactRange,
  dayDateLabel,
  dayFullLabel,
  formatMoney,
  formatTime,
  rangeDays,
  toDateOnly,
} from '@/components/travel/detail/format'

/**
 * 移动端旅行详情的纯格式化助手。
 *
 * 这些值直接出现在头部摘要、日期胶囊与花销卡上，算错一天或一位小数就是用户可见的错。
 * 尤其 rangeDays 必须与新建表单（lib/modules/travel/draft.ts 的 evaluateDateRange）同口径，
 * 否则会出现「建时说 3 天、详情说 2 天」。
 */
describe('travel detail format', () => {
  it('toDateOnly 输出本地 YYYY-MM-DD（不受时区把日期挪一天的影响）', () => {
    expect(toDateOnly(new Date(2026, 9, 1).toISOString())).toBe('2026-10-01')
    expect(toDateOnly('')).toBe('')
    expect(toDateOnly(null)).toBe('')
    expect(toDateOnly('not-a-date')).toBe('')
  })

  it('dayDateLabel / dayFullLabel：有日期显示 MM.DD 周X，无日期回退 DAY 0N', () => {
    const d = new Date(2026, 9, 1).toISOString()
    expect(dayDateLabel(d, 0)).toBe('10.01 周四')
    expect(dayFullLabel(d, 0)).toBe('DAY 01 · 10.01 周四')
    expect(dayDateLabel(null, 2)).toBe('DAY 03')
  })

  /**
   * 行程时间是**墙上时间**（行程表上的 17:00），不是时间点。
   * 服务端用 Date.UTC 写入、客户端用 getUTC* 读回（详见 travel.service.parseTimeOrDate
   * 与 formatTime 的注释），因此这里必须用「UTC 字段即墙上时间」的输入来断言。
   *
   * 旧断言写的是 `new Date(2026, 9, 1, 14, 30).toISOString()`（本地时间构造），
   * 它只在"测试机时区恰好与构造时区一致"时通过 —— 本身就依赖时区，
   * 正是那个真机 bug（选 17:00 显示 01:00）在测试里的同构形态。
   */
  it('formatTime 支持 ISO 与 HH:mm:ss 两种形态（按墙上时间 / UTC 字段）', () => {
    expect(formatTime('14:30:00')).toBe('14:30')
    // UTC 字段即墙上时间：14:30Z 在**任何时区**都渲染为 14:30
    expect(formatTime('2026-10-01T14:30:00.000Z')).toBe('14:30')
    // 真机故障回归：17:00 / 21:00 不得被平移成次日 01:00 / 05:00
    expect(formatTime('2026-10-01T17:00:00.000Z')).toBe('17:00')
    expect(formatTime('2026-10-01T21:00:00.000Z')).toBe('21:00')
    expect(formatTime(null)).toBe('')
  })

  it('compactRange：同一天只显示一次，跨天用「至」', () => {
    const a = new Date(2026, 9, 1).toISOString()
    const b = new Date(2026, 9, 7).toISOString()
    expect(compactRange(a, b)).toBe('10.01 至 10.07')
    expect(compactRange(a, a)).toBe('10.01')
    expect(compactRange(a, null)).toBe('10.01')
    expect(compactRange(null, b)).toBe('')
  })

  it('rangeDays：含首尾；与新建表单同口径（单日 = 1 天 0 晚）', () => {
    const a = new Date(2026, 9, 1).toISOString()
    const c = new Date(2026, 9, 3).toISOString()
    expect(rangeDays(a, c)).toBe(3)
    expect(rangeDays(a, a)).toBe(1)
    expect(rangeDays(a, null)).toBe(1)
    expect(rangeDays(null, c)).toBeNull()
  })

  it('formatMoney：整数不带小数，小数保留两位；非有限值兜底为 0', () => {
    expect(formatMoney(5000)).toBe('5000')
    expect(formatMoney(128.5)).toBe('128.50')
    expect(formatMoney(Number.NaN)).toBe('0')
  })
})
