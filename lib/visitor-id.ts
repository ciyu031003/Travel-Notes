'use client'

// 生成/读取稳定的访客 ID（localStorage 持久化，用于点赞去重）
const STORAGE_KEY = 'travel_notes_visitor_id'

function generateId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `v-${rand}`
}

export function getVisitorId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY)
    if (!id) {
      id = generateId()
      localStorage.setItem(STORAGE_KEY, id)
    }
    return id
  } catch {
    return generateId()
  }
}
