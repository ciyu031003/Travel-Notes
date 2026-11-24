import { EXPENSE_LABELS, normalizeExpenseCategory } from '@/lib/modules/travel/expense-categories'
import type { ExpenseCardData, ExpenseDeckData, ExpenseCategoryKey } from './types'

/**
 * 账本 → 费用卡片（纯函数，无 React / 无网络）。
 *
 * 口径（与「花销」tab 的 AA 计算保持一致，但更保守）：
 *  · 参与人 = 同行者名单 ∪ 每笔账的付款人；没人就退化为「我」；
 *  · 单笔人均 = 金额 / 参与人数（四舍五入到分，展示到元）；
 *  · 只有参与人 ≥ 2 才显示分摊，单人之旅卡片更干净（不出现"每人 ¥1,500"）。
 *
 * 时间：happenedAt 有就按它显示"12月8日 14:20"；没记时间就只显示日期；
 * 连日期都没记（老数据）用旅程日期兜底，避免卡片上出现空白。
 */

export interface ExpenseLike {
  id: number
  amount: number
  currency?: string | null
  category?: string | null
  payer?: string | null
  note?: string | null
  happenedAt?: string | null
}

export interface CompanionLike {
  name?: string | null
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  JPY: '¥',
  GBP: '£',
}

const round2 = (n: number) => Math.round(n * 100) / 100

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

/** 1234.5 → "1,234.5"；整数不带小数，超过两位小数四舍五入 */
export function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const rounded = round2(n)
  const hasFraction = Math.abs(rounded % 1) > 0.001
  const [intPart, fracPart] = rounded.toFixed(hasFraction ? 2 : 0).split('.')
  const withSeparator = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fracPart ? withSeparator + '.' + fracPart.replace(/0$/, '') : withSeparator
}

export function formatCny(n: number, symbol = '¥'): string {
  return symbol + formatAmount(n)
}

interface DeriveDeckInput {
  travelId: number
  travelTitle: string
  expenses: ExpenseLike[]
  companions?: CompanionLike[]
  /** 兜底日期（旅程开始日，ISO 字符串；老账目没记 happenedAt 时用） */
  fallbackDate?: string | null
}

export function buildExpenseDeck(input: DeriveDeckInput): ExpenseDeckData | null {
  const expenses = (input.expenses || []).filter((e) => (Number(e.amount) || 0) > 0)
  if (expenses.length === 0) return null

  const names = new Set<string>()
  for (const c of input.companions || []) {
    const name = String(c?.name || '').trim()
    if (name) names.add(name)
  }
  for (const e of expenses) {
    const payer = String(e.payer || '').trim()
    if (payer) names.add(payer)
  }
  if (names.size === 0) names.add('我')
  const memberCount = names.size

  const total = round2(expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0))

  /**
   * 排序：**金额从大到小**。
   *
   * 需求原话是「本次机票花了 1500，就弹出 1500 的卡片」——牌堆第一张应该是这趟
   * 花钱最多的那笔，扫一眼就知道"钱花哪儿了"；金额相同再按时间近的在前。
   * （按时间排序会让 42 块的扎染手帕排在最上面，反而不像结算。）
   */
  const ordered = [...expenses].sort((a, b) => {
    const amountDiff = (Number(b.amount) || 0) - (Number(a.amount) || 0)
    if (Math.abs(amountDiff) > 0.001) return amountDiff
    const at = a.happenedAt ? new Date(a.happenedAt).getTime() : 0
    const bt = b.happenedAt ? new Date(b.happenedAt).getTime() : 0
    return bt - at
  })

  const fallback = input.fallbackDate ? new Date(input.fallbackDate) : null

  const cards: ExpenseCardData[] = ordered.map((e) => {
    const category = normalizeExpenseCategory(e.category) as ExpenseCategoryKey
    const label = EXPENSE_LABELS[category] || '其他'
    const amount = Number(e.amount) || 0
    const currency = String(e.currency || 'CNY').toUpperCase()
    const symbol = CURRENCY_SYMBOLS[currency] || '¥'

    const when = e.happenedAt ? new Date(e.happenedAt) : fallback
    const validWhen = when && !Number.isNaN(when.getTime()) ? when : null
    const dateText = validWhen ? validWhen.getMonth() + 1 + '月' + validWhen.getDate() + '日' : '旅途中的一笔'
    // 只有真的记了时刻才显示 HH:mm（午夜零点的"00:00"是日期字段的占位，不展示）
    const hh = validWhen ? validWhen.getHours() : 0
    const mm = validWhen ? validWhen.getMinutes() : 0
    const timeText = validWhen && !(hh === 0 && mm === 0) ? pad2(hh) + ':' + pad2(mm) : null

    const share = memberCount > 1 ? round2(amount / memberCount) : null
    const shareText = share != null ? '每人 ' + formatCny(share, symbol) : null
    const note = e.note ? String(e.note).trim() : null
    const payer = e.payer ? String(e.payer).trim() : null

    // 刮开层只放"卡面还没说的信息"：人均已在卡面的 AA 行里，这里不重复
    const revealParts: string[] = []
    if (memberCount > 1) revealParts.push(memberCount + ' 人同行')
    if (payer) revealParts.push('付款人：' + payer)
    if (note) revealParts.push('备注：' + note)
    if (revealParts.length === 0) revealParts.push(label + ' · 已归档')

    return {
      id: e.id,
      category,
      label,
      amount,
      amountText: formatAmount(amount),
      currencySymbol: symbol,
      dateText,
      timeText,
      note,
      payer,
      shareText,
      scratchHint: shareText ? '刮开看人均' : '刮开看详情',
      scratchReveal: revealParts.join(' · '),
    }
  })

  const perPerson = memberCount > 1 ? round2(total / memberCount) : null

  return {
    travelId: input.travelId,
    travelTitle: input.travelTitle,
    cards,
    total,
    totalText: formatCny(total),
    perPersonText: perPerson != null ? memberCount + ' 人同行 · 每人 ' + formatCny(perPerson) : null,
    memberCount,
  }
}
