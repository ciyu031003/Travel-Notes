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

  it('formatTime 支持 ISO 与 HH:mm:ss 两种形态', () => {
    expect(formatTime('14:30:00')).toBe('14:30')
    expect(formatTime(new Date(2026, 9, 1, 14, 30).toISOString())).toBe('14:30')
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
