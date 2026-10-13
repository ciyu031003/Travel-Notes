import { describe, it, expect } from 'vitest'
import { roleMixOf, formatRoleMix, moreSectionSummary, EMPTY_TRAVEL_DRAFT } from '@/lib/modules/travel/draft'

/**
 * 多角色同行（2026-10-13）
 *
 * 聚会 / 团建这类出行是**混合关系**（朋友 + 家人 + 同事同团），
 * 只显示「5 位同行」看不出构成。roleMixOf 把同行者按关系聚合，
 * 供表单与折叠摘要展示，让用户在提交前确认人员构成。
 */
describe('roleMixOf · 同行者角色构成', () => {
  it('按关系聚合，人数多的在前', () => {
    const mix = roleMixOf([
      { name: 'A', relation: '朋友' },
      { name: 'B', relation: '家人' },
      { name: 'C', relation: '朋友' },
    ])
    expect(mix).toEqual([
      { relation: '朋友', count: 2 },
      { relation: '家人', count: 1 },
    ])
  })

  it('未填关系的归入「同行」', () => {
    expect(roleMixOf([{ name: 'A', relation: '' }])).toEqual([{ relation: '同行', count: 1 }])
  })

  it('人数相同的分组按关系名稳定排序（渲染顺序不跳）', () => {
    const a = roleMixOf([
      { name: 'A', relation: '同事' },
      { name: 'B', relation: '家人' },
    ])
    const b = roleMixOf([
      { name: 'B', relation: '家人' },
      { name: 'A', relation: '同事' },
    ])
    // 输入顺序不同，输出顺序必须一致
    expect(a).toEqual(b)
  })

  it('空数组返回空', () => {
    expect(roleMixOf([])).toEqual([])
    expect(formatRoleMix([])).toBe('')
  })

  it('formatRoleMix 产出「朋友 2 · 家人 1」', () => {
    expect(
      formatRoleMix([
        { name: 'A', relation: '朋友' },
        { name: 'B', relation: '家人' },
        { name: 'C', relation: '朋友' },
      ]),
    ).toBe('朋友 2 · 家人 1')
  })

  it('折叠摘要同时给出总人数与构成（多角色混合一眼可见）', () => {
    const s = moreSectionSummary({
      ...EMPTY_TRAVEL_DRAFT,
      travelType: 'GROUP',
      companions: [
        { name: 'A', relation: '朋友' },
        { name: 'B', relation: '同事' },
      ],
    })
    expect(s).toContain('结伴 / 聚会')
    expect(s).toContain('2 位同行')
    expect(s).toContain('朋友 1')
    expect(s).toContain('同事 1')
  })
})
