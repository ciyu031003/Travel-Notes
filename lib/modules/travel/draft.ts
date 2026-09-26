import { CITIES_BY_PROVINCE, type City } from '@/data/cities'
import { provinces } from '@/data/provinces'

/**
 * 新建旅行 · 纯逻辑层
 *
 * 与 UI 解耦、可单测：日期校验 / 天数回算 / 标题建议 / 目的地联想 / 折叠区摘要。
 * 这些是"表单好不好用"的关键判断，全部不依赖 DOM。
 */

/* ------------------------------------------------------------------ */
/* 表单数据                                                             */
/* ------------------------------------------------------------------ */

export interface TravelDraft {
  /** 目的地 → Travel.location（画册按城市成册依赖它，见 travel.service.createTravel 注释） */
  location: string
  startDate: string
  endDate: string
  title: string
  description: string
  travelType: string
  companions: { name: string; relation: string }[]
  /**
   * 可见性三档。
   * 为什么不再用 `isPublic` 布尔：那个字段只影响「公开」，而 `visibility` 一直在吃
   * schema 默认的 `SPACE` —— 用户勾「仅自己」，旅行其实是「空间成员可见」。
   * 三档显式表达，落库时也写 visibility（见 travel.service.createTravel）。
   */
  visibility: 'PRIVATE' | 'SPACE' | 'PUBLIC'
  /** 直接建在某个空间下（可选，「一键加入空间」） */
  spaceId: number | null
}

export const EMPTY_TRAVEL_DRAFT: TravelDraft = {
  location: '',
  startDate: '',
  endDate: '',
  title: '',
  description: '',
  travelType: 'ALONE',
  companions: [],
  visibility: 'PRIVATE',
  spaceId: null,
}

export const TRAVEL_TYPE_OPTIONS: {
  value: string
  label: string
  /** 一句说明：让「闺蜜/兄弟」「结伴」这类标签自解释（原先只有两个字，用户看不出差别） */
  hint: string
}[] = [
  { value: 'ALONE', label: '独旅', hint: '一个人出发' },
  { value: 'COUPLE', label: '情侣', hint: '两个人的旅行' },
  { value: 'FAMILY', label: '家庭', hint: '带上家人' },
  { value: 'FRIENDS', label: '朋友', hint: '和朋友同行' },
  { value: 'BFF', label: '闺蜜 / 兄弟', hint: '最要好的那位' },
  { value: 'GROUP', label: '结伴', hint: '多人拼团出行' },
  { value: 'OTHER', label: '其他', hint: '还没想好' },
]

export const MAX_COMPANIONS = 10
/** 常用关系快捷项：避免每加一个人都要现打「伴侣 / 朋友」 */
export const COMMON_RELATIONS = ['伴侣', '家人', '朋友', '同事', '同学'] as const

/* ------------------------------------------------------------------ */
/* 日期：校验 + 天数回算                                                 */
/* ------------------------------------------------------------------ */

export interface DateRangeInfo {
  /** 共几天（含首尾）。日期不全时为 null */
  days: number | null
  /** 共几晚（天数 - 1，最小 0） */
  nights: number | null
  /** 校验错误（用于就近提示 + 禁用提交） */
  error: string | null
}

const DAY_MS = 86_400_000

/** 解析 `YYYY-MM-DD`（本地零点，避免时区把日期偏移一天） */
export function parseLocalDate(value: string): Date | null {
  if (!value) return null
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** 区间校验 + 天数回算（参考产品顶部的「3日2晚」就是这里算出来的） */
export function evaluateDateRange(startDate: string, endDate: string): DateRangeInfo {
  const s = parseLocalDate(startDate)
  const e = parseLocalDate(endDate)
  if (!s && !e) return { days: null, nights: null, error: null }
  // 只选了开始日：按 1 天 0 晚算，允许"一日游"
  if (s && !e) return { days: 1, nights: 0, error: null }
  if (!s && e) return { days: null, nights: null, error: '请先选择开始日期' }
  const diff = Math.round((e!.getTime() - s!.getTime()) / DAY_MS)
  if (diff < 0) return { days: null, nights: null, error: '结束日期不能早于开始日期' }
  const days = diff + 1
  return { days, nights: days - 1, error: null }
}

/** 「8月14日 周五出发 · 至 19日」这类副标题 */
export function formatRangeSubtitle(startDate: string, endDate: string): string | null {
  const s = parseLocalDate(startDate)
  if (!s) return null
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][s.getDay()]
  const head = `${s.getMonth() + 1}月${s.getDate()}日 ${week}出发`
  const e = parseLocalDate(endDate)
  if (!e) return head
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
  const tail = sameMonth ? `${e.getDate()}日` : `${e.getMonth() + 1}月${e.getDate()}日`
  return `${head} · 至 ${tail}`
}

/** 紧凑日期：`08.14` 或 `08.14 - 08.19`（区块标题 / 卡片用） */
export function formatCompactRange(startDate: string, endDate: string): string {
  const p = (v: string) => {
    const d = parseLocalDate(v)
    return d ? `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : ''
  }
  const s = p(startDate)
  const e = p(endDate)
  if (!s) return ''
  if (!e || e === s) return s
  return `${s} - ${e}`
}

/* ------------------------------------------------------------------ */
/* 标题建议                                                            */
/* ------------------------------------------------------------------ */

/**
 * 由目的地 + 天数派生候选标题。
 *
 * 参考产品的做法是「目的地 + 日期先定，标题自然长出来」——用户不必对着空白框想名字。
 * 一旦用户手动改过标题，调用方必须停止覆盖（用 `isTitlePristine` 判断）。
 */
export function suggestTitles(location: string, days: number | null): string[] {
  const place = location.trim()
  if (!place) return []
  const out: string[] = []
  if (days && days > 0) out.push(`${place} ${days} 日`)
  out.push(`${place}之行`)
  if (days && days > 0) out.push(`${place} ${days} 天`)
  out.push(place)
  return Array.from(new Set(out)).slice(0, 3)
}

/**
 * 标题是否仍处于"未被用户改动"状态（可被建议安全覆盖）。
 * 空标题算 pristine；等于任一历史建议也算 pristine。
 */
export function isTitlePristine(current: string, previousSuggestions: string[]): boolean {
  const c = current.trim()
  if (!c) return true
  return previousSuggestions.includes(c)
}

/* ------------------------------------------------------------------ */
/* 目的地联想                                                          */
/* ------------------------------------------------------------------ */

export interface LocationSuggestion {
  /** 落库值（城市名） */
  value: string
  /** 展示用（省份 · 城市） */
  label: string
  nameEn: string
}

/**
 * 目的地联想：基于既有城市库（`data/cities.ts`，与画册 `findCityByName` 同一份数据）。
 * 空查询返回空数组（避免一打开就铺满一屏）。
 * 排序：精确 > 前缀 > 包含 > 拼音前缀 > 拼音包含；同级按名字短优先（直辖市/省会更像"目的地"）。
 *
 * 注意：`CITIES_BY_PROVINCE` 的键是**省份 id**（如 `jiangsu`），展示前必须换成中文省名，
 * 否则用户看到的是 "jiangsu · 南京"这种半英文标签。
 */
export function suggestLocations(query: string, limit = 6): LocationSuggestion[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const provinceName = new Map(provinces.map((p) => [p.id, p.name]))

  const scored: { city: City; province: string; rank: number }[] = []
  for (const [provinceId, cities] of Object.entries(CITIES_BY_PROVINCE)) {
    const provinceLabel = provinceName.get(provinceId) ?? provinceId
    for (const city of cities) {
      const name = city.name
      const en = (city.nameEn || '').toLowerCase()
      let rank = -1
      if (name === q) rank = 0
      else if (name.startsWith(q)) rank = 1
      else if (name.includes(q)) rank = 2
      else if (en.startsWith(q)) rank = 3
      else if (en.includes(q)) rank = 4
      if (rank < 0) continue
      scored.push({ city, province: provinceLabel, rank })
    }
  }

  scored.sort((a, b) => a.rank - b.rank || a.city.name.length - b.city.name.length)

  const out: LocationSuggestion[] = []
  const seen = new Set<string>()
  for (const { city, province } of scored) {
    if (seen.has(city.name)) continue
    seen.add(city.name)
    // 直辖市（省份名 == 城市名）不必重复成「北京 · 北京」
    const label = province && province !== city.name ? `${province} · ${city.name}` : city.name
    out.push({ value: city.name, label, nameEn: city.nameEn })
    if (out.length >= limit) break
  }
  return out
}

/* ------------------------------------------------------------------ */
/* 汇总校验 / 摘要                                                     */
/* ------------------------------------------------------------------ */

export interface DraftValidation {
  canSubmit: boolean
  /** 首条阻塞原因（按钮旁提示用） */
  blocker: string | null
  dateError: string | null
  days: number | null
  nights: number | null
}

export function validateDraft(draft: TravelDraft): DraftValidation {
  const range = evaluateDateRange(draft.startDate, draft.endDate)
  const hasTitle = draft.title.trim().length > 0
  let blocker: string | null = null
  if (!hasTitle) blocker = '给这段旅程起个名字吧'
  else if (draft.location.trim().length > 120) blocker = '目的地太长了'
  else if (range.error) blocker = range.error
  return {
    canSubmit: blocker === null,
    blocker,
    dateError: range.error,
    days: range.days,
    nights: range.nights,
  }
}

/** 折叠区摘要：收起时也要让用户看到自己填过什么 */
export function moreSectionSummary(draft: TravelDraft): string {
  const parts: string[] = []
  const type = TRAVEL_TYPE_OPTIONS.find((t) => t.value === draft.travelType)
  if (type && type.value !== 'ALONE') parts.push(type.label)
  if (draft.companions.length > 0) parts.push(`${draft.companions.length} 位同行`)
  if (draft.description.trim()) parts.push('有描述')
  if (draft.visibility === 'PUBLIC') parts.push('公开')
  else if (draft.spaceId) parts.push('空间内分享')
  return parts.join(' · ')
}
