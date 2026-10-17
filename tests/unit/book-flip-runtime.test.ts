import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FLIPPING_TIME_MS,
  INSTANT_FLIPPING_TIME_MS,
  MAX_FLIPPING_TIME_MS,
  SHADOW_OPACITY_ON,
  resolveFlippingTime,
  resolveShadowOpacity,
} from '@/lib/modules/album/book/flip-runtime'
import { BOOK_TIER_KEYS, BOOK_TIER_PROFILES } from '@/components/album/book/themes/catalog'

/**
 * 翻页运行时换算单测（Album 2.0 优化）
 *
 * 最重要的断言是**库契约**：`page-flip` 2.0.7 的 `getSettings()` 会对
 * `flippingTime <= 0` 抛 "Invalid flipping time"。视觉档里 reduced = 0（直切）
 * 是刻意保留的语义，因此「语义值 → 库可接受值」的换算必须恒 > 0 ——
 * 这条断言就是「reduced 用户打开画册不再白屏」的可执行版本。
 */

describe('resolveFlippingTime：语义值 → 库可接受值', () => {
  it('库的硬约束：任何输入换算后都 > 0（flippingTime=0 会让构造器抛错）', () => {
    const inputs = [-1, 0, 0.5, 1, 380, 560, 2000, 9999, NaN, Infinity]
    for (const input of inputs) {
      expect(resolveFlippingTime(input)).toBeGreaterThan(0)
    }
  })

  it('0 / 负数（直切语义）换算为 1ms 瞬时值，而不是 0', () => {
    expect(resolveFlippingTime(0)).toBe(INSTANT_FLIPPING_TIME_MS)
    expect(resolveFlippingTime(-100)).toBe(INSTANT_FLIPPING_TIME_MS)
  })

  it('正常档位原样保留', () => {
    expect(resolveFlippingTime(380)).toBe(380)
    expect(resolveFlippingTime(560)).toBe(560)
  })

  it('上界收敛，避免异常配置让翻页慢到不可读', () => {
    expect(resolveFlippingTime(9999)).toBe(MAX_FLIPPING_TIME_MS)
    expect(resolveFlippingTime(MAX_FLIPPING_TIME_MS)).toBe(MAX_FLIPPING_TIME_MS)
  })

  it('缺省 / 非数值回落默认档（不把 NaN 混进库的动画计算）', () => {
    expect(resolveFlippingTime(undefined)).toBe(DEFAULT_FLIPPING_TIME_MS)
    expect(resolveFlippingTime(null)).toBe(DEFAULT_FLIPPING_TIME_MS)
    expect(resolveFlippingTime(NaN)).toBe(DEFAULT_FLIPPING_TIME_MS)
    expect(resolveFlippingTime(Infinity)).toBe(DEFAULT_FLIPPING_TIME_MS)
  })
})

describe('resolveShadowOpacity：阴影开关 → 最大不透明度', () => {
  it('开阴影给档位值，关阴影归零', () => {
    expect(resolveShadowOpacity(true)).toBe(SHADOW_OPACITY_ON)
    expect(resolveShadowOpacity(false)).toBe(0)
    expect(resolveShadowOpacity(undefined)).toBe(0)
  })
})

describe('与视觉档联动：三个档位都能安全喂给 page-flip', () => {
  it('每个档位的 flippingTime 换算后都合法（> 0）', () => {
    for (const tier of BOOK_TIER_KEYS) {
      const profile = BOOK_TIER_PROFILES[tier]
      expect(resolveFlippingTime(profile.flippingTime), `${tier} 档`).toBeGreaterThan(0)
    }
  })

  it('reduced 档 = 直切 + 无阴影；standard 档 = 有阴影', () => {
    const reduced = BOOK_TIER_PROFILES.reduced
    expect(reduced.flippingTime).toBe(0)
    expect(resolveFlippingTime(reduced.flippingTime)).toBe(INSTANT_FLIPPING_TIME_MS)
    expect(resolveShadowOpacity(reduced.drawShadow)).toBe(0)

    expect(resolveFlippingTime(BOOK_TIER_PROFILES.standard.flippingTime)).toBe(
      BOOK_TIER_PROFILES.standard.flippingTime,
    )
    expect(resolveShadowOpacity(BOOK_TIER_PROFILES.standard.drawShadow)).toBe(SHADOW_OPACITY_ON)
    expect(resolveShadowOpacity(BOOK_TIER_PROFILES.lite.drawShadow)).toBe(0)
  })
})
