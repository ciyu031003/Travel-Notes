'use client'

import { useMemo, useState } from 'react'
import ExpenseDeck from '@/components/mobile/expense/ExpenseDeck'
import { buildExpenseDeck, type ExpenseLike } from '@/lib/expense-card/derive'

/** 调试页（仅开发环境公开）：旅程账单费用卡片牌堆 + 刮开涂层 */

const SAMPLE: ExpenseLike[] = [
  { id: 1, amount: 1500, currency: 'CNY', category: 'TRANSPORT', payer: '我', note: '机票 北京→大理', happenedAt: '2026-10-18T07:20:00.000Z' },
  { id: 2, amount: 620, currency: 'CNY', category: 'HOTEL', payer: '阿岚', note: '洱海边民宿 2 晚', happenedAt: '2026-10-18T15:10:00.000Z' },
  { id: 3, amount: 500, currency: 'CNY', category: 'FOOD', payer: '小鹿', note: '古城聚餐', happenedAt: '2026-10-19T12:30:00.000Z' },
  { id: 4, amount: 88, currency: 'CNY', category: 'TRANSPORT', payer: '我', note: '打车去才村', happenedAt: '2026-10-20T09:05:00.000Z' },
  { id: 5, amount: 120, currency: 'CNY', category: 'TICKET', payer: '阿岚', note: '崇圣寺三塔', happenedAt: '2026-10-20T10:40:00.000Z' },
  { id: 6, amount: 42, currency: 'CNY', category: 'SHOPPING', payer: '小鹿', note: '扎染小手帕', happenedAt: '2026-10-21T16:15:00.000Z' },
]

const COMPANIONS = [{ name: '我' }, { name: '阿岚' }, { name: '小鹿' }]

export default function ExpenseCardsPreviewPage() {
  const [solo, setSolo] = useState(false)
  const [open, setOpen] = useState(true)
  const deck = useMemo(
    () =>
      buildExpenseDeck({
        travelId: 9001,
        travelTitle: '大理的风与海',
        expenses: SAMPLE,
        companions: solo ? [] : COMPANIONS,
        fallbackDate: '2026-10-18',
      }),
    [solo],
  )
  const soloDeck = useMemo(
    () =>
      buildExpenseDeck({
        travelId: 9002,
        travelTitle: '青岛的夏天',
        expenses: SAMPLE.slice(0, 2).map((e) => ({ ...e, payer: null })),
        companions: [],
        fallbackDate: '2025-07-20',
      }),
    [],
  )

  if (!deck) return null
  return (
    <main className="mx-auto w-full max-w-[430px] px-5 py-10">
      <h1 className="text-[18px] font-bold text-[var(--m-text)]">费用卡片 · 预览</h1>
      <p className="mt-1 text-[13px] leading-6 text-[var(--m-muted)]">
        牌堆 + 左右滑动 + 刮开涂层。下面的按钮切换「3 人同行」与「单人旅途」两套数据。
      </p>
      <div className="mt-4 flex gap-2">
        <button type="button" className="m-btn m-btn-ghost flex-1" onClick={() => { setSolo(false); setOpen(true) }}>
          3 人同行
        </button>
        <button type="button" className="m-btn m-btn-primary flex-1" onClick={() => { setSolo(true); setOpen(true) }}>
          单人旅途
        </button>
      </div>
      {open && (
        <ExpenseDeck
          deck={solo ? (soloDeck ?? deck) : deck}
          onClose={() => setOpen(false)}
        />
      )}
      {!open && (
        <button type="button" className="m-btn m-btn-primary mt-3 w-full" onClick={() => setOpen(true)}>
          重新打开牌堆
        </button>
      )}
    </main>
  )
}
