import { describe, it, expect } from 'vitest'
import {
  COMMON_RELATIONS,
  EMPTY_TRAVEL_DRAFT,
  TRAVEL_TYPE_OPTIONS,
  evaluateDateRange,
  formatCompactRange,
  formatRangeSubtitle,
  isTitlePristine,
  moreSectionSummary,
  parseLocalDate,
  suggestLocations,
  suggestTitles,
  validateDraft,
  type TravelDraft,
} from '@/lib/modules/travel/draft'

/**
 * 新建旅行纯逻辑单测。
 *
 * 这些判断决定"表单好不好用"：日期算错天数、标题建议覆盖用户输入、
 * 目的地联想给出无关结果——都是用户能立刻感觉到的问题，且都能在这里锁住。
 */

function draft(over: Partial<TravelDraft> = {}): TravelDraft {
  return { ...EMPTY_TRAVEL_DRAFT, ...over }
}

describe('evaluateDateRange', () => {
  it('两端都空：无天数、无错误', () => {
    expect(evaluateDateRange('', '')).toEqual({ days: null, nights: null, error: null })
  })

  it('只选开始日：按一日游算（1 天 0 晚）', () => {
    expect(evaluateDateRange('2026-08-14', '')).toEqual({ days: 1, nights: 0, error: null })
  })

  it('只选结束日：提示先选开始日', () => {
    const r = evaluateDateRange('', '2026-08-19')
    expect(r.days).toBeNull()
    expect(r.error).toBe('请先选择开始日期')
  })

  it('同日：1 天 0 晚', () => {
    expect(evaluateDateRange('2026-08-14', '2026-08-14')).toEqual({ days: 1, nights: 0, error: null })
  })

  it('跨 5 天：6 日 5 晚（含首尾）', () => {
    expect(evaluateDateRange('2026-08-14', '2026-08-19')).toEqual({ days: 6, nights: 5, error: null })
  })

  it('跨月也正确', () => {
    expect(evaluateDateRange('2026-08-30', '2026-09-02')).toEqual({ days: 4, nights: 3, error: null })
  })

  it('结束早于开始：报错且不给天数', () => {
    const r = evaluateDateRange('2026-08-19', '2026-08-14')
    expect(r.error).toBe('结束日期不能早于开始日期')
    expect(r.days).toBeNull()
  })

  it('非法格式按空值处理，不抛错', () => {
    // 斜杠分隔不是我们的存储格式（表单给的是 YYYY-MM-DD）→ 视为未填
    expect(evaluateDateRange('2026/08/14', '')).toEqual({ days: null, nights: null, error: null })
    // 但合法的开始日 + 空结束日 = 一日游
    expect(evaluateDateRange('2026-08-14', '')).toEqual({ days: 1, nights: 0, error: null })
    expect(parseLocalDate('not-a-date')).toBeNull()
    expect(parseLocalDate('2026/08/14')).toBeNull()
    expect(parseLocalDate('')).toBeNull()
  })

  it('不因时区把日期偏移（本地零点解析）', () => {
    const d = parseLocalDate('2026-08-14')!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(14)
  })
})

describe('日期文案', () => {
  it('副标题含星期与出发日', () => {
    // 2026-08-14 是周五
    expect(formatRangeSubtitle('2026-08-14', '')).toBe('8月14日 周五出发')
  })

  it('同月区间只写结尾日；跨月写完整', () => {
    expect(formatRangeSubtitle('2026-08-14', '2026-08-19')).toBe('8月14日 周五出发 · 至 19日')
    expect(formatRangeSubtitle('2026-08-30', '2026-09-02')).toBe('8月30日 周日出发 · 至 9月2日')
  })

  it('无开始日返回 null / 空串', () => {
    expect(formatRangeSubtitle('', '2026-08-19')).toBeNull()
    expect(formatCompactRange('', '2026-08-19')).toBe('')
  })

  it('紧凑区间：单日只写一个', () => {
    expect(formatCompactRange('2026-08-14', '2026-08-14')).toBe('08.14')
    expect(formatCompactRange('2026-08-14', '2026-08-19')).toBe('08.14 - 08.19')
  })
})

describe('suggestTitles', () => {
  it('无目的地不给建议（避免空标题被写成"之行"）', () => {
    expect(suggestTitles('', 6)).toEqual([])
    expect(suggestTitles('   ', 6)).toEqual([])
  })

  it('有目的地 + 天数：首个建议是「目的地 N 日」', () => {
    expect(suggestTitles('新疆', 6)[0]).toBe('新疆 6 日')
  })

  it('无天数也能给建议', () => {
    const s = suggestTitles('新疆', null)
    expect(s).toContain('新疆之行')
    expect(s).toContain('新疆')
  })

  it('最多 3 条且不重复', () => {
    const s = suggestTitles('新疆', 6)
    expect(s.length).toBeLessThanOrEqual(3)
    expect(new Set(s).size).toBe(s.length)
  })
})

describe('isTitlePristine', () => {
  it('空标题算未改动', () => {
    expect(isTitlePristine('', ['新疆 6 日'])).toBe(true)
  })

  it('等于历史建议算未改动（可被新建议覆盖）', () => {
    expect(isTitlePristine('新疆 6 日', ['新疆 6 日', '新疆之行'])).toBe(true)
  })

  it('用户自己写的不算未改动（不得被覆盖）', () => {
    expect(isTitlePristine('我和她的第一次远行', ['新疆 6 日'])).toBe(false)
  })
})

describe('suggestLocations', () => {
  it('空查询不返回（避免一打开铺一屏）', () => {
    expect(suggestLocations('')).toEqual([])
    expect(suggestLocations('   ')).toEqual([])
  })

  it('能按中文前缀命中', () => {
    const r = suggestLocations('乌鲁木齐')
    expect(r.length).toBeGreaterThan(0)
    expect(r[0].value).toBe('乌鲁木齐')
    expect(r[0].label).toContain('乌鲁木齐')
  })

  it('精确命中排在前缀命中之前', () => {
    const r = suggestLocations('南京')
    expect(r[0].value).toBe('南京')
  })

  it('能按拼音命中', () => {
    const r = suggestLocations('urumqi')
    expect(r.some((x) => x.value === '乌鲁木齐')).toBe(true)
  })

  it('limit 生效且结果去重', () => {
    const r = suggestLocations('州', 3)
    expect(r.length).toBeLessThanOrEqual(3)
    expect(new Set(r.map((x) => x.value)).size).toBe(r.length)
  })

  it('无匹配返回空数组（不抛错）', () => {
    expect(suggestLocations('zzzzzz-not-a-city')).toEqual([])
  })
})

describe('validateDraft / moreSectionSummary', () => {
  it('无标题不可提交，且给出可读原因', () => {
    const v = validateDraft(draft({ location: '新疆' }))
    expect(v.canSubmit).toBe(false)
    expect(v.blocker).toBe('给这段旅程起个名字吧')
  })

  it('日期倒置不可提交，blocker 用日期错误', () => {
    const v = validateDraft(draft({ title: '新疆行', startDate: '2026-08-19', endDate: '2026-08-14' }))
    expect(v.canSubmit).toBe(false)
    expect(v.blocker).toBe('结束日期不能早于开始日期')
    expect(v.dateError).toBe('结束日期不能早于开始日期')
  })

  it('只有标题也可提交（其余都是可选项）', () => {
    const v = validateDraft(draft({ title: '新疆行' }))
    expect(v.canSubmit).toBe(true)
    expect(v.blocker).toBeNull()
  })

  it('目的地超长不可提交', () => {
    const v = validateDraft(draft({ title: 'x', location: 'a'.repeat(121) }))
    expect(v.canSubmit).toBe(false)
    expect(v.blocker).toBe('目的地太长了')
  })

  it('折叠区摘要在未填时不显示内容，填了才显示', () => {
    expect(moreSectionSummary(draft({ title: 'x' }))).toBe('')

    const s = moreSectionSummary(draft({
      travelType: 'COUPLE',
      companions: [{ name: '阿元', relation: '伴侣' }],
      description: '走城墙',
      visibility: 'PUBLIC',
    }))
    expect(s).toContain('情侣')
    expect(s).toContain('1 位同行')
    expect(s).toContain('有描述')
    expect(s).toContain('公开')
  })

  it('默认类型（独旅）不出现在摘要里（它是默认值，不是用户选择）', () => {
    expect(moreSectionSummary(draft({ travelType: 'ALONE' }))).toBe('')
  })
})

describe('常量', () => {
  it('类型选项齐全且每项都有说明', () => {
    expect(TRAVEL_TYPE_OPTIONS.map((t) => t.value)).toEqual([
      'ALONE', 'COUPLE', 'FAMILY', 'FRIENDS', 'BFF', 'GROUP', 'OTHER',
    ])
    for (const t of TRAVEL_TYPE_OPTIONS) {
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.hint.length).toBeGreaterThan(0)
    }
  })

  it('常用关系非空', () => {
    expect(COMMON_RELATIONS.length).toBeGreaterThan(0)
  })
})
