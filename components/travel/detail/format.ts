/**
 * 移动端旅行详情 · 纯格式化助手（与具体 tab 无关，故单独放）
 */

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function toDateOnly(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** `10.01 周四`（无日期时回退 `DAY 03`） */
export function dayDateLabel(date: string | null, index: number): string {
  if (!date) return `DAY ${String(index + 1).padStart(2, '0')}`
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return `DAY ${String(index + 1).padStart(2, '0')}`
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${WEEK[d.getDay()]}`
}

/** `DAY 03 · 10.01 周四`（抽屉/选择器里的完整标签） */
export function dayFullLabel(date: string | null, index: number): string {
  return `DAY ${String(index + 1).padStart(2, '0')} · ${dayDateLabel(date, index)}`
}

/**
 * 时间 → HH:mm（无值返回空串）。
 *
 * ⚠️ 只对**纯时间串**（HH:mm / HH:mm:ss）走截取快路径。
 * 带日期的 ISO（如 2026-10-01T06:30:00.000Z）必须先转 Date 再取本地时分 ——
 * 此前用正则直接在 ISO 上匹配，会把 UTC 的 06:30 当成当地时间显示（东八区差 8 小时），
 * 表现是「行程时间凭空少 8 小时」。单测 tests/unit/travel-detail-format.test.ts 锁住了这条。
 */
export function formatTime(value: string | null | undefined): string {
  if (!value) return ''
  const s = String(value)
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0, 5)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

/** `10.01 - 10.07`（同一天只显示一次） */
export function compactRange(startDate: string | null | undefined, endDate: string | null | undefined): string {
  const p = (v?: string | null) => {
    if (!v) return ''
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return ''
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }
  const s = p(startDate)
  const e = p(endDate)
  if (!s) return ''
  if (!e || e === s) return s
  return `${s} 至 ${e}`
}

/** 含首尾的天数（与 `lib/modules/travel/draft.ts` 的口径一致） */
export function rangeDays(startDate: string | null | undefined, endDate: string | null | undefined): number | null {
  if (!startDate) return null
  const s = new Date(startDate)
  if (Number.isNaN(s.getTime())) return null
  if (!endDate) return 1
  const e = new Date(endDate)
  if (Number.isNaN(e.getTime())) return 1
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1
  return days > 0 ? days : null
}

/**
 * 同一张媒体不同变体的 URL → 同一个 key。
 *
 * 为什么需要：时间线走 THUMBNAIL、详情接口走 PREVIEW，同一张照片会得到两个不同 URL。
 * 相册页签若按 URL 去重，"其他照片"里就会把当天的照片又列一遍（实测截图里「共 2 张」
 * 其实只有 1 张）。这里把 `xxx-thumbnail.jpg` / `-preview` / `-blur` 归一成原始 key。
 */
export function mediaKeyOf(url: string): string {
  if (!url) return ''
  const path = url.split('?')[0].split('#')[0]
  return path
    .replace(/-(thumbnail|preview|blur)\.(jpe?g|png|webp|avif|gif)$/i, '')
    .replace(/\.[a-z0-9]+$/i, '')
}

/** 金额显示：整数不带小数，小数保留两位 */
export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}
