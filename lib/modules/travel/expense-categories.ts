/**
 * 旅行花销分类（唯一事实源）。
 *
 * 为什么抽出来：分类值此前只写在 `app/admin/travels/page.tsx` 里，前台花销 tab
 * 若各自再抄一份，两处迟早漂移（后台记的是 `HOTEL`、前台显示成"未知分类"）。
 * 纯常量模块，服务端/客户端都能 import。
 */
export const EXPENSE_CATEGORIES = ['TRANSPORT', 'HOTEL', 'FOOD', 'TICKET', 'SHOPPING', 'OTHER'] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export const EXPENSE_LABELS: Record<string, string> = {
  TRANSPORT: '交通',
  HOTEL: '住宿',
  FOOD: '餐饮',
  TICKET: '门票',
  SHOPPING: '购物',
  OTHER: '其他',
}

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === 'string' && (EXPENSE_CATEGORIES as readonly string[]).includes(value)
}

/** 归一化：不认识的分类一律落到 OTHER，避免脏值把分组汇总打散 */
export function normalizeExpenseCategory(value: unknown): ExpenseCategory {
  return isExpenseCategory(value) ? value : 'OTHER'
}
