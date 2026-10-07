import { describe, it, expect } from 'vitest'
import { yuanToCents, centsToYuan } from '@/lib/modules/travel/money'

/**
 * 金额元↔分换算（1.19.0 起 Expense 存储为整数分）。
 * 关键回归：浮点元直接求和的 0.1+0.2 类精度误差，必须在整数分上消失。
 */
describe('money · 元↔分换算', () => {
  it('元 → 分四舍五入到整数分', () => {
    expect(yuanToCents(0)).toBe(0)
    expect(yuanToCents(1)).toBe(100)
    expect(yuanToCents(123.45)).toBe(12345)
    // 二进制浮点经典值：0.1 * 100 = 10.000000000000002，必须收口为 10
    expect(yuanToCents(0.1)).toBe(10)
    expect(yuanToCents(41.99)).toBe(4199)
  })

  it('分 → 元精确到 0.01', () => {
    expect(centsToYuan(0)).toBe(0)
    expect(centsToYuan(100)).toBe(1)
    expect(centsToYuan(12345)).toBe(123.45)
    expect(centsToYuan(1)).toBe(0.01)
  })

  it('往返换算无损', () => {
    for (const yuan of [0.01, 0.1, 9.99, 123.45, 8888.88, 999999.99]) {
      expect(centsToYuan(yuanToCents(yuan))).toBe(yuan)
    }
  })

  it('整数分求和不累积浮点误差（浮点直接求和会）', () => {
    // 浮点直接求和：0.1 + 0.2 + 0.3 === 0.6000000000000001
    const floatSum = 0.1 + 0.2 + 0.3
    expect(floatSum).not.toBe(0.6)

    const cents = [0.1, 0.2, 0.3].map(yuanToCents)
    const centsSum = cents.reduce((s, c) => s + c, 0)
    expect(centsToYuan(centsSum)).toBe(0.6)
  })

  it('边界：超大金额（Int 上限内）无损', () => {
    // MySQL INT 上限 2_147_483_647 分 ≈ ¥21,474,836.47
    expect(yuanToCents(21_474_836.47)).toBe(2_147_483_647)
    expect(centsToYuan(2_147_483_647)).toBe(21_474_836.47)
  })
})
