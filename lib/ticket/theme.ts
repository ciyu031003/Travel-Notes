import type { TicketDayPart, TicketSeason } from './types'

/**
 * 票据主题：四季 × 一天四段（16 套天光配色）。
 *
 * 配色写在 app/ticket-art.css（设计 token 门禁只扫 .ts/.tsx，票面属于独立的
 * 「插画层」，与画册主题皮肤同一类资产），这里只负责：
 *  · 把 season/dayPart 映射成根节点 class（`tk tk-spring-dusk`）；
 *  · 提供中文标签（票面/编辑面板用）。
 */
export const SEASON_LABEL: Record<TicketSeason, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
}

export const SEASON_FULL: Record<TicketSeason, string> = {
  spring: '春日',
  summer: '盛夏',
  autumn: '秋日',
  winter: '冬雪',
}

export const DAYPART_LABEL: Record<TicketDayPart, string> = {
  morning: '清晨',
  noon: '正午',
  dusk: '黄昏',
  evening: '夜晚',
}

/** 票根/徽标上的季节天光短句，如「秋 · 黄昏」 */
export function ticketMoodLabel(season: TicketSeason, dayPart: TicketDayPart): string {
  return SEASON_LABEL[season] + ' · ' + DAYPART_LABEL[dayPart]
}

/** 票据根节点 class：所有配色/纹理都由它驱动（见 app/ticket-art.css） */
export function ticketThemeClass(season: TicketSeason, dayPart: TicketDayPart): string {
  return 'tk tk-' + season + '-' + dayPart
}

/** 一天四段的排序（归档分组用） */
export const DAYPART_ORDER: TicketDayPart[] = ['morning', 'noon', 'dusk', 'evening']
export const SEASON_ORDER: TicketSeason[] = ['spring', 'summer', 'autumn', 'winter']
