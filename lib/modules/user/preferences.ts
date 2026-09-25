/**
 * 新用户偏好问卷（注册并登录后弹一次；完成或跳过即不再弹）。
 *
 * 为什么落库而不是 localStorage：问卷结果要用于「新建旅行默认同行者 + 行程注意事项提示」，
 * 必须跟账号走。已有 components/mobile/Onboarding.tsx 用本地标记控制首启引导 ——
 * 换设备会再弹，这对"引导"可接受，对"偏好"不可接受（结果会丢）。
 *
 * 纯逻辑模块（无 React / 无 DB），便于单测锁定归一化与"是否该弹"的判定。
 */

export const PREFERENCE_COMPANION_STYLES = [
  { value: 'ALONE', label: '独自', hint: '一个人出发' },
  { value: 'COUPLE', label: '和伴侣', hint: '两个人的旅行' },
  { value: 'FRIENDS', label: '和朋友', hint: '朋友同行' },
  { value: 'FAMILY', label: '一家人', hint: '带上家人' },
] as const

export type CompanionStyle = (typeof PREFERENCE_COMPANION_STYLES)[number]['value']

/** 第 2 屏：什么会让你惊喜（多选） */
export const PREFERENCE_DELIGHTS = [
  { value: 'HIDDEN_SPOT', label: '发现隐藏景点' },
  { value: 'NEW_FRIENDS', label: '认识新朋友' },
  { value: 'GOOD_FINDS', label: '淘到心动好物' },
  { value: 'LOCAL_EVENT', label: '赶上特色活动' },
] as const

/** 第 2 屏反面：什么最扫兴（多选） */
export const PREFERENCE_VETOES = [
  { value: 'BAD_PLAN', label: '规划不清' },
  { value: 'CROWDED', label: '景点拥挤' },
  { value: 'OVERPACKED', label: '行程太满' },
  { value: 'TOO_THRIFTY', label: '过度省钱' },
  { value: 'EARLY_RISE', label: '起得太早' },
  { value: 'LONG_TRANSIT', label: '路上太久' },
] as const

/** 第 3 屏：需要特别留意的（多选）——命中后会在行程页签给一行提示 */
export const PREFERENCE_CAUTIONS = [
  { value: 'NO_STRENUOUS', label: '避免剧烈运动' },
  { value: 'MOTION_SICK', label: '容易晕车晕船' },
  { value: 'WITH_KIDS', label: '会带小朋友' },
  { value: 'WITH_PETS', label: '会带宠物' },
  { value: 'ACCESSIBILITY', label: '需要无障碍设施' },
  { value: 'ALTITUDE', label: '容易高反' },
] as const

export interface TravelPreferences {
  companionStyle: CompanionStyle | null
  delights: string[]
  vetoes: string[]
  cautions: string[]
  /** true 表示这一步是"跳过"而非"完成"（用于后续做引导补全的候选） */
  skipped?: boolean
}

export const EMPTY_PREFERENCES: TravelPreferences = {
  companionStyle: null,
  delights: [],
  vetoes: [],
  cautions: [],
}

function allowedValues(list: readonly { value: string }[]): Set<string> {
  return new Set(list.map((o) => o.value))
}

function pickKnown(input: unknown, allowed: Set<string>, max: number): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const v = raw.trim()
    // 只收白名单内的值：脏值/被改过的请求体不能污染后续的默认值与提示
    if (!allowed.has(v) || out.includes(v)) continue
    out.push(v)
    if (out.length >= max) break
  }
  return out
}

/** 归一化任意输入 → 可信的偏好结构（未知值一律丢弃） */
export function normalizePreferences(input: unknown): TravelPreferences {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const style = typeof raw.companionStyle === 'string' ? raw.companionStyle.trim() : ''
  const companionStyle = allowedValues(PREFERENCE_COMPANION_STYLES).has(style)
    ? (style as CompanionStyle)
    : null
  return {
    companionStyle,
    delights: pickKnown(raw.delights, allowedValues(PREFERENCE_DELIGHTS), PREFERENCE_DELIGHTS.length),
    vetoes: pickKnown(raw.vetoes, allowedValues(PREFERENCE_VETOES), PREFERENCE_VETOES.length),
    cautions: pickKnown(raw.cautions, allowedValues(PREFERENCE_CAUTIONS), PREFERENCE_CAUTIONS.length),
    ...(raw.skipped === true ? { skipped: true } : {}),
  }
}

/** 从库里读出来的（可能为 null / 历史脏值）→ 归一化 */
export function readStoredPreferences(input: unknown): TravelPreferences {
  if (!input) return { ...EMPTY_PREFERENCES }
  return normalizePreferences(input)
}

/**
 * 是否应该弹问卷：**只在"从未完成过"时为真**。
 * 幂等锚点是 preferencesCompletedAt（完成与跳过都会写入），
 * 因此刷新页面、换设备、重装 App 都不会再弹。
 */
export function shouldShowPreferenceSurvey(user: {
  preferencesCompletedAt?: string | Date | null
} | null | undefined): boolean {
  if (!user) return false
  return !user.preferencesCompletedAt
}

/** 同行者风格 → 新建旅行表单的默认旅行类型 */
export function travelTypeFromPreferences(prefs: TravelPreferences | null | undefined): string | null {
  return prefs?.companionStyle ?? null
}

/** 命中"需要特别留意"的条目 → 行程页签顶部的一行提示（无命中返回 null） */
export function cautionHint(cautions: string[] | null | undefined): string | null {
  if (!cautions || cautions.length === 0) return null
  const labels = PREFERENCE_CAUTIONS.filter((c) => cautions.includes(c.value)).map((c) => c.label)
  if (labels.length === 0) return null
  return '你提到过：' + labels.join('、') + '，排行程时留意一下'
}
