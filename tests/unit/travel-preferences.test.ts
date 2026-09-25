import { describe, it, expect } from 'vitest'
import {
  EMPTY_PREFERENCES,
  PREFERENCE_CAUTIONS,
  cautionHint,
  normalizePreferences,
  readStoredPreferences,
  shouldShowPreferenceSurvey,
  travelTypeFromPreferences,
} from '@/lib/modules/user/preferences'

/**
 * 偏好问卷的纯逻辑：归一化、只弹一次的判定、以及"收集来干什么用"。
 *
 * 闸门（问卷只弹一次）靠 preferencesCompletedAt，写错就会每次刷新都弹，
 * 或者永远不弹 —— 两个方向都是用户可见的事故，因此逐条锁住。
 */
describe('preferences · normalize', () => {
  it('空输入得到空偏好而不是抛错', () => {
    expect(normalizePreferences(null)).toEqual(EMPTY_PREFERENCES)
    expect(normalizePreferences(undefined)).toEqual(EMPTY_PREFERENCES)
    expect(normalizePreferences('oops')).toEqual(EMPTY_PREFERENCES)
  })

  it('未知枚举值一律丢弃（脏请求体不能污染默认值与提示）', () => {
    const p = normalizePreferences({
      companionStyle: 'HACKER',
      delights: ['HIDDEN_SPOT', 'NOT_A_REAL_OPTION'],
      vetoes: 'nope',
      cautions: ['ALTITUDE', 42, null],
    })
    expect(p.companionStyle).toBeNull()
    expect(p.delights).toEqual(['HIDDEN_SPOT'])
    expect(p.vetoes).toEqual([])
    expect(p.cautions).toEqual(['ALTITUDE'])
  })

  it('去重且不超过选项总数', () => {
    const p = normalizePreferences({
      cautions: ['ALTITUDE', 'ALTITUDE', 'WITH_KIDS', ...PREFERENCE_CAUTIONS.map((c) => c.value)],
    })
    expect(p.cautions.length).toBe(PREFERENCE_CAUTIONS.length)
    expect(new Set(p.cautions).size).toBe(p.cautions.length)
  })

  it('skipped 只有显式 true 才记录', () => {
    expect(normalizePreferences({ skipped: true }).skipped).toBe(true)
    expect(normalizePreferences({ skipped: 'true' }).skipped).toBeUndefined()
    expect(normalizePreferences({}).skipped).toBeUndefined()
  })

  it('readStoredPreferences 兼容库里的 null / 历史脏值', () => {
    expect(readStoredPreferences(null)).toEqual(EMPTY_PREFERENCES)
    expect(readStoredPreferences({ companionStyle: 'COUPLE' }).companionStyle).toBe('COUPLE')
    expect(readStoredPreferences({ companionStyle: 'LEGACY' }).companionStyle).toBeNull()
  })
})

describe('preferences · 只弹一次', () => {
  it('未完成（null/undefined）→ 该弹', () => {
    expect(shouldShowPreferenceSurvey({ preferencesCompletedAt: null })).toBe(true)
    expect(shouldShowPreferenceSurvey({})).toBe(true)
  })

  it('完成或跳过（有时间戳）→ 不再弹', () => {
    expect(shouldShowPreferenceSurvey({ preferencesCompletedAt: new Date() })).toBe(false)
    expect(shouldShowPreferenceSurvey({ preferencesCompletedAt: '2026-09-25T00:00:00.000Z' })).toBe(false)
  })

  it('拿不到用户 → 不弹（未登录 / 请求失败都不该弹）', () => {
    expect(shouldShowPreferenceSurvey(null)).toBe(false)
    expect(shouldShowPreferenceSurvey(undefined)).toBe(false)
  })
})

describe('preferences · 结果的用途', () => {
  it('同行者风格 → 新建旅行的默认类型', () => {
    expect(travelTypeFromPreferences({ ...EMPTY_PREFERENCES, companionStyle: 'FAMILY' })).toBe('FAMILY')
    expect(travelTypeFromPreferences(EMPTY_PREFERENCES)).toBeNull()
    expect(travelTypeFromPreferences(null)).toBeNull()
  })

  it('特别注意 → 行程页提示；无命中返回 null', () => {
    expect(cautionHint(['ALTITUDE', 'WITH_KIDS'])).toBe('你提到过：会带小朋友、容易高反，排行程时留意一下')
    expect(cautionHint([])).toBeNull()
    expect(cautionHint(null)).toBeNull()
    expect(cautionHint(['NOT_A_REAL_OPTION'])).toBeNull()
  })
})
