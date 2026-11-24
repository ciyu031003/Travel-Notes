/**
 * 费用卡片（旅程账本 → 纪念卡）数据契约
 * ---------------------------------------------------------------------------
 * 一段旅程归档后，账本里**每一笔花销**生成一张卡（需求：1500 的机票一张、
 * 500 的一餐一张，多笔就多张），卡片在屏幕中央以牌堆形式呈现，左右滑动切换。
 *
 * 为什么是派生而不是建表：账目已经是事实来源（Expense 表），卡片只是它的
 * 一种"结算后纪念化"的展示形态；另建一张表会立刻产生"改了账卡片不同步"的问题。
 * 卡片上的视觉分类色、金额排版、人均分摊全部由这里算好，组件只负责画。
 */

export type ExpenseCategoryKey = 'TRANSPORT' | 'HOTEL' | 'FOOD' | 'TICKET' | 'SHOPPING' | 'OTHER'

export interface ExpenseCardData {
  id: number
  category: ExpenseCategoryKey
  /** 分类中文名（交通/住宿/餐饮/门票/购物/其他） */
  label: string
  /** 金额（元，展示用） */
  amount: number
  /** 金额数字（已加千分位） */
  amountText: string
  /** 币种符号（¥ / $ …） */
  currencySymbol: string
  /** 花费日期（12月8日） */
  dateText: string
  /** 花费时刻（14:20；没记录日期时为 null） */
  timeText: string | null
  /** 备注（"机票 北京→大理"），没有就用分类名 */
  note: string | null
  payer: string | null
  /**
   * 多人同行时这一笔的人均文案（"每人 ¥500"）；单人旅行为 null。
   * 刮开区默认把这句话藏起来 —— 先看到"花了多少"，再决定要不要看分摊。
   */
  shareText: string | null
  /** 刮开区上的提示（"刮开看这一笔"） */
  scratchHint: string
  /** 刮开后的内容（人均分摊 / 备注 / 付款人） */
  scratchReveal: string
}

export interface ExpenseDeckData {
  travelId: number
  travelTitle: string
  cards: ExpenseCardData[]
  total: number
  totalText: string
  /** "3 人同行 · 每人 ¥1,427"；单人时为 null */
  perPersonText: string | null
  memberCount: number
}
