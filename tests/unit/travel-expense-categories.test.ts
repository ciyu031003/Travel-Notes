import { describe, it, expect } from 'vitest'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_LABELS,
  isExpenseCategory,
  normalizeExpenseCategory,
} from '@/lib/modules/travel/expense-categories'

/**
 * 花销分类是后台与前台共享的唯一事实源（此前只写在 admin 页里，前台若各抄一份必然漂移）。
 * 这里锁住三件事：分类集合、标签齐全、脏值归一。
 */
describe('expense-categories', () => {
  it('分类集合与后台表单保持一致', () => {
    expect(EXPENSE_CATEGORIES).toEqual(['TRANSPORT', 'HOTEL', 'FOOD', 'TICKET', 'SHOPPING', 'OTHER'])
  })

  it('每个分类都有中文标签（少一个前台就会显示原始英文枚举）', () => {
    for (const c of EXPENSE_CATEGORIES) {
      expect(EXPENSE_LABELS[c], c).toBeTruthy()
    }
  })

  it('isExpenseCategory 只认真实枚举值', () => {
    expect(isExpenseCategory('HOTEL')).toBe(true)
    expect(isExpenseCategory('hotel')).toBe(false)
    expect(isExpenseCategory('FOO')).toBe(false)
    expect(isExpenseCategory(null)).toBe(false)
    expect(isExpenseCategory(123)).toBe(false)
  })

  it('normalizeExpenseCategory 把脏值收进 OTHER（而不是把分组汇总打散）', () => {
    expect(normalizeExpenseCategory('FOOD')).toBe('FOOD')
    expect(normalizeExpenseCategory('')).toBe('OTHER')
    expect(normalizeExpenseCategory(undefined)).toBe('OTHER')
    expect(normalizeExpenseCategory({ evil: true })).toBe('OTHER')
  })
})
