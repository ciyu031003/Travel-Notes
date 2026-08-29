/**
 * 旅行画册（album/travel-book）共享展示工具。
 * 收敛此前散落在 TravelBook / BookReader / PostcardCard / album/page 里的重复常量与日期格式。
 * 仅含纯展示函数，无副作用，客户端/服务端均可引入。
 */

/** 旅行类型 → 中文标签（与 TravelComposer/TravelDetailShell 一致） */
export const TRAVEL_TYPE_LABELS: Record<string, string> = {
  ALONE: '独旅',
  COUPLE: '情侣',
  FAMILY: '家庭',
  FRIENDS: '朋友',
  BFF: '闺蜜/兄弟',
  GROUP: '结伴',
  OTHER: '其他',
}

/** 心情 → 中文标签 */
export const MOOD_LABEL: Record<string, string> = {
  开心: '开心',
  幸福: '幸福',
  想念: '想念',
  期待: '期待',
  平静: '平静',
  累: '累了',
}

/**
 * 画册用日期短格式：YYYY.MM.DD（区别于 lib/utils 的「2026年8月29日」长格式）。
 * 无效或空输入返回空字符串。
 */
export function formatDotDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return ''
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

/** 别名：travel-book 内部惯用名 formatDay 指向同一实现。 */
export const formatDay = formatDotDate
