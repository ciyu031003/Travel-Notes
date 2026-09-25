'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2, Wallet } from 'lucide-react'
import { ActionSheet } from '@/components/mobile/ActionSheet'
import { Button } from '@/components/mobile/Button'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { Field, FieldTextarea } from '@/components/mobile/Field'
import { Icon } from '@/components/mobile/Icon'
import { Loader } from '@/components/mobile/Loader'
import { apiUrl } from '@/lib/api-base'
import { toast } from '@/lib/mobile/toast-store'
import { updateTravelInfo } from '@/lib/modules/offline/travel-edit'
import { EXPENSE_CATEGORIES, EXPENSE_LABELS, type ExpenseCategory } from '@/lib/modules/travel/expense-categories'
import { formatMoney, toDateOnly } from './format'
import type { ExpenseItem, TimelineDay } from './types'

/**
 * 「花销」tab —— 预算 vs 已花 + 分类记账。
 *
 * 真机反馈「花销预计是多少，没有入口」。后端其实早有 Expense 模型与 addExpense，
 * 但接口只挂在 /api/admin/** 且要能力位，普通用户用不了；而且「预算」这个字段
 * **根本不存在**（本次新增 Travel.budget）。
 *
 * 这里是接口那一半 + UI 这一半：预算可设可清，流水按分类汇总，合计实时回算。
 */
export default function TravelExpenseTab({
  travelId,
  slug,
  days,
  loading,
  state,
  onChanged,
}: {
  travelId: number
  slug: string
  days: TimelineDay[]
  loading: boolean
  state: { expenses: ExpenseItem[]; total: number; budget: number | null } | null
  onChanged: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [showBudget, setShowBudget] = useState(false)
  const [actionItem, setActionItem] = useState<ExpenseItem | null>(null)

  const total = state?.total ?? 0
  const budget = state?.budget ?? null
  const remaining = budget != null ? budget - total : null
  const percent = budget && budget > 0 ? Math.min(100, Math.round((total / budget) * 100)) : 0

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of state?.expenses ?? []) {
      map.set(e.category, (map.get(e.category) ?? 0) + (e.amount || 0))
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [state])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader />
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-4">
      {/* 预算卡：没有预算时也给「设置预算」入口，而不是把整块藏掉 */}
      <section className="m-card p-4">
        <div className="flex items-center gap-2">
          <Icon icon={Wallet} size="sm" className="text-[var(--m-accent-strong)]" />
          <span className="m-body font-semibold text-[var(--m-text)]">花销</span>
          <button
            type="button"
            onClick={() => setShowBudget(true)}
            className="ml-auto text-[13px] font-medium text-[var(--m-accent-strong)] active:scale-95"
          >
            {budget == null ? '设置预算' : '改预算'}
          </button>
        </div>

        <div className="mt-3 flex items-end gap-2">
          <span className="text-[28px] font-bold tabular-nums text-[var(--m-text)]">¥{formatMoney(total)}</span>
          {budget != null && (
            <span className="pb-1 text-[13px] text-[var(--m-muted)]">/ 预算 ¥{formatMoney(budget)}</span>
          )}
        </div>

        {budget != null ? (
          <>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--m-surface-2)]">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${percent}%`,
                  background: remaining != null && remaining < 0 ? 'var(--m-danger)' : 'var(--m-accent)',
                }}
              />
            </div>
            <p className="mt-2 text-[12px] text-[var(--m-muted)]">
              {remaining != null && remaining >= 0
                ? `还可花 ¥${formatMoney(remaining)}（已用 ${percent}%）`
                : `已超预算 ¥${formatMoney(Math.abs(remaining ?? 0))}`}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[12px] text-[var(--m-faint)]">设一个预算，就能看到「还能花多少」</p>
        )}
      </section>

      {/* 分类汇总 */}
      {byCategory.length > 0 && (
        <section className="m-card p-4">
          <p className="m-field-label">分类</p>
          <ul className="mt-2.5 space-y-2">
            {byCategory.map(([cat, amount]) => (
              <li key={cat} className="flex items-center gap-2 text-[14px]">
                <span className="w-14 text-[12px] text-[var(--m-muted)]">{EXPENSE_LABELS[cat] || cat}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--m-surface-2)]">
                  <span
                    className="block h-full rounded-full bg-[var(--m-accent)]"
                    style={{ width: `${total > 0 ? Math.round((amount / total) * 100) : 0}%` }}
                  />
                </span>
                <span className="w-16 text-right tabular-nums text-[var(--m-text)]">¥{formatMoney(amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 流水 */}
      <section>
        <div className="flex items-center gap-2">
          <span className="m-section-title mb-0 flex-1">明细</span>
          <Button size="sm" icon={Plus} onClick={() => setShowAdd(true)}>
            记一笔
          </Button>
        </div>

        {(state?.expenses.length ?? 0) === 0 ? (
          <p className="mt-4 text-center text-[13px] text-[var(--m-faint)]">还没有花销记录</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {state!.expenses.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setActionItem(e)}
                  className="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left active:bg-[var(--m-surface-2)]"
                >
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[var(--m-accent-soft)] text-[11px] font-semibold text-[var(--m-accent-strong)]">
                    {EXPENSE_LABELS[e.category]?.slice(0, 2) || '其他'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="m-body block truncate text-[var(--m-text)]">
                      {e.note || EXPENSE_LABELS[e.category] || e.category}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-[var(--m-faint)]">
                      {e.happenedAt ? toDateOnly(e.happenedAt) : ''}
                      {e.payer ? ` · ${e.payer}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-[var(--m-text)]">
                    ¥{formatMoney(e.amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AddExpenseSheet
        open={showAdd}
        travelId={travelId}
        days={days}
        onClose={() => setShowAdd(false)}
        onDone={onChanged}
      />

      <BudgetSheet
        open={showBudget}
        travelId={travelId}
        slug={slug}
        budget={budget}
        onClose={() => setShowBudget(false)}
        onDone={onChanged}
      />

      <ActionSheet
        open={Boolean(actionItem)}
        title={actionItem ? `¥${formatMoney(actionItem.amount)}` : undefined}
        onClose={() => setActionItem(null)}
        options={[
          {
            label: '删除这条记录',
            destructive: true,
            onClick: async () => {
              if (!actionItem) return
              const res = await fetch(apiUrl(`/api/travels/${travelId}/expenses/${actionItem.id}`), {
                method: 'DELETE',
                credentials: 'include',
              }).catch(() => null)
              if (res && res.ok) {
                toast.success('已删除')
                onChanged()
              } else {
                toast.error('删除失败')
              }
            },
          },
        ]}
      />
    </div>
  )
}

/** 记一笔花销 */
function AddExpenseSheet({
  open,
  travelId,
  days,
  onClose,
  onDone,
}: {
  open: boolean
  travelId: number
  days: TimelineDay[]
  onClose: () => void
  onDone: () => void
}) {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('TRANSPORT')
  const [note, setNote] = useState('')
  const [payer, setPayer] = useState('')
  const [date, setDate] = useState(toDateOnly(new Date().toISOString()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError('请输入有效金额')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/travels/${travelId}/expenses`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: value,
          category,
          note: note.trim() || undefined,
          payer: payer.trim() || undefined,
          happenedAt: date ? new Date(`${date}T12:00:00`).toISOString() : undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '保存失败')
      toast.success('已记一笔')
      setAmount('')
      setNote('')
      setPayer('')
      onDone()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="记一笔花销">
      <div className="space-y-4">
        <Field
          label="金额（元）"
          type="number"
          inputMode="decimal"
          placeholder="例如 128"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <div>
          <p className="m-field-label">分类</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {EXPENSE_CATEGORIES.map((c) => {
              const active = category === c
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(c)}
                  className={
                    'min-h-[44px] rounded-2xl border text-[13px] font-medium transition active:scale-[0.98] ' +
                    (active
                      ? 'border-[var(--m-accent)] bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]'
                      : 'border-[var(--m-line)] text-[var(--m-text)]')
                  }
                >
                  {EXPENSE_LABELS[c]}
                </button>
              )
            })}
          </div>
        </div>

        <Field label="日期" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Field label="付款人" placeholder="可选" value={payer} onChange={(e) => setPayer(e.target.value)} />
        <FieldTextarea
          label="备注"
          rows={2}
          placeholder="例如 机场大巴"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {days.length === 0 && (
          <p className="m-caption text-[var(--m-faint)]">提示：这本旅行还没有日期，花销仍会记在旅行名下</p>
        )}

        {error && (
          <p role="alert" className="text-[13px] text-[var(--m-danger)]">
            {error}
          </p>
        )}

        <Button block size="lg" loading={saving} onClick={submit}>
          保存
        </Button>
      </div>
    </BottomSheet>
  )
}

/** 设置 / 修改 / 清空预算 */
function BudgetSheet({
  open,
  travelId,
  slug,
  budget,
  onClose,
  onDone,
}: {
  open: boolean
  travelId: number
  slug: string
  budget: number | null
  onClose: () => void
  onDone: () => void
}) {
  const [value, setValue] = useState(budget != null ? String(budget) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (next: number | null) => {
    setSaving(true)
    setError('')
    try {
      // 走离线优先的编辑通道：原生壳离线也能改，联网后自动同步
      const r = await updateTravelInfo({ travelId, slug, budget: next })
      if (!r.ok) throw new Error(r.error || '保存失败')
      toast.success(r.local ? '已保存到本地，联网后自动同步' : '已保存')
      onDone()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="旅行预算">
      <div className="space-y-4">
        <Field
          label="预算（元）"
          type="number"
          inputMode="decimal"
          placeholder="例如 5000"
          hint="留空并点「清空预算」可取消预算"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-[13px] text-[var(--m-danger)]">
            {error}
          </p>
        )}
        <Button block size="lg" loading={saving} onClick={() => save(value === '' ? null : Number(value))}>
          保存
        </Button>
        {budget != null && (
          <Button block variant="ghost" icon={Trash2} disabled={saving} onClick={() => save(null)}>
            清空预算
          </Button>
        )}
      </div>
    </BottomSheet>
  )
}
