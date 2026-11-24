'use client'

import type { TicketOverride } from './types'

/**
 * 票面覆盖字段的本地存储（暂时不改数据库）。
 *
 * 为什么先放 localStorage：票是旅程的展示层投影，覆盖项（交通方式/出发到达/时间/座位）
 * 属于"纪念品排版偏好"，不需要跨端同步也能成立；等确认体验稳定后再考虑落到服务器
 * （Travel 增加 transportType / ticketOverride JSON 两列 + 迁移）。
 *
 * 约定：key 带 schema 版本号；读失败/隐私模式一律静默降级为空。
 */

const KEY = 'tn:tickets:v1'

type Store = Record<string, TicketOverride>

function readAll(): Store {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {}
  } catch {
    return {}
  }
}

export function readTicketOverride(travelId: number): TicketOverride | undefined {
  return readAll()[String(travelId)]
}

export function writeTicketOverride(travelId: number, patch: TicketOverride): TicketOverride {
  const all = readAll()
  const next: TicketOverride = { ...(all[String(travelId)] || {}), ...patch }
  all[String(travelId)] = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* 配额/隐私模式：忽略，票面退回派生值 */
  }
  return next
}

/** 清空某段旅程的覆盖（「恢复默认票面」用） */
export function clearTicketOverride(travelId: number): void {
  const all = readAll()
  delete all[String(travelId)]
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}
