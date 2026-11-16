'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calculator, Link2, Plus, Trash2, Users, Wallet } from 'lucide-react'
import { ActionSheet } from '@/components/mobile/ActionSheet'
import { Button } from '@/components/mobile/Button'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { Field, FieldTextarea } from '@/components/mobile/Field'
import { SelectField } from '@/components/mobile/SelectField'
import { DateField } from '@/components/travel/DateRangePicker'
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
/**
 * 行程 id → 可读标签（如 "2026-11-01 08:30 高铁 北京→上海"）。
 *
 * 抽到模块级：花销表单（下拉选项）与花销列表（回显归属）都要用，
 * 两处在不同组件里，避免各自复制一份摊平逻辑。
 */
function buildItineraryLabelMap(days: TimelineDay[]): Map<number, string> {
  const map = new Map<number, string>()
  for (const d of days) {
    const day = d.date ? toDateOnly(d.date) : ''
    for (const it of d.itinerary || []) {
      const time = it.startTime ? String(it.startTime).slice(11, 16) : ''
      map.set(it.id, [day, time, it.title].filter(Boolean).join(' '))
    }
  }
  return map
}

interface CompanionLike {
  name?: string
  relation?: string
}

interface AaMember {
  name: string
  paid: number
  /** 已付 - 应摊；> 0 应收，< 0 应付 */
  balance: number
}

interface AaTransfer {
  from: string
  to: string
  amount: number
}

interface AaResult {
  total: number
  share: number
  members: AaMember[]
  transfers: AaTransfer[]
  /** 没有填付款人的笔数 / 金额：计入总额，但无法归属到人 */
  missingPayerCount: number
  missingPayerAmount: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * AA 结算（纯函数）。
 *
 * 口径：只有**点过「一键计算 AA」**才调用它 —— 平时只记账、不分摊。
 * 参与人 = 同行者 ∪ 每笔花销的付款人（没人就退化成「我」）；总额按人头均摊。
 * 转账方案用「债务/债权贪心配对」：每次让最大应付去还最大应收，
 * 产出不超过 n-1 条转账（手动算 AA 时的最省笔数做法）。
 */
function buildAaLedger(
  expenses: ExpenseItem[],
  companions: CompanionLike[],
): AaResult | null {
  const total = round2(expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0))
  if (total <= 0) return null

  const names = new Set<string>()
  for (const c of companions) {
    const n = String(c?.name || '').trim()
    if (n) names.add(n)
  }
  for (const e of expenses) {
    const n = String(e.payer || '').trim()
    if (n) names.add(n)
  }
  if (names.size === 0) names.add('我')

  const paid = new Map<string, number>()
  for (const n of Array.from(names)) paid.set(n, 0)
  let missingPayerCount = 0
  let missingPayerAmount = 0
  for (const e of expenses) {
    const n = String(e.payer || '').trim()
    const amount = Number(e.amount) || 0
    if (!n) {
      missingPayerCount += 1
      missingPayerAmount += amount
      continue
    }
    paid.set(n, (paid.get(n) ?? 0) + amount)
  }

  const share = round2(total / names.size)
  const members: AaMember[] = Array.from(paid.entries()).map(([name, p]) => ({
    name,
    paid: round2(p),
    balance: round2(p - share),
  }))

  const creditors = members
    .filter((m) => m.balance > 0.005)
    .map((m) => ({ name: m.name, amount: m.balance }))
    .sort((a, b) => b.amount - a.amount)
  const debtors = members
    .filter((m) => m.balance < -0.005)
    .map((m) => ({ name: m.name, amount: -m.balance }))
    .sort((a, b) => b.amount - a.amount)

  const transfers: AaTransfer[] = []
  let ci = 0
  let di = 0
  while (ci < creditors.length && di < debtors.length) {
    const amount = round2(Math.min(creditors[ci].amount, debtors[di].amount))
    if (amount > 0.005) {
      transfers.push({ from: debtors[di].name, to: creditors[ci].name, amount })
    }
    creditors[ci].amount = round2(creditors[ci].amount - amount)
    debtors[di].amount = round2(debtors[di].amount - amount)
    if (creditors[ci].amount <= 0.005) ci += 1
    if (debtors[di].amount <= 0.005) di += 1
  }

  return {
    total,
    share,
    members,
    transfers,
    missingPayerCount,
    missingPayerAmount: round2(missingPayerAmount),
  }
}

export default function TravelExpenseTab({
  travelId,
  slug,
  days,
  companions = [],
  loading,
  state,
  onChanged,
}: {
  travelId: number
  slug: string
  days: TimelineDay[]
  /** 同行者：AA 的参与人来源之一（另一来源是每笔花销的付款人） */
  companions?: CompanionLike[]
  loading: boolean
  state: { expenses: ExpenseItem[]; total: number; budget: number | null } | null
  onChanged: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  /** AA 结果：null = 还没点过「一键计算 AA」（此时页面只有原始记账数据） */
  const [aaResult, setAaResult] = useState<AaResult | null>(null)
  const [showBudget, setShowBudget] = useState(false)
  const [actionItem, setActionItem] = useState<ExpenseItem | null>(null)

  // 账目变了，之前算出的 AA 结果就作废（避免显示一份过期的分摊）
  useEffect(() => {
    setAaResult(null)
  }, [state?.total, state?.expenses.length])

  const total = state?.total ?? 0
  const budget = state?.budget ?? null
  const remaining = budget != null ? budget - total : null
  const percent = budget && budget > 0 ? Math.min(100, Math.round((total / budget) * 100)) : 0

  /** 行程 id → 标签：列表里回显"这笔钱绑在哪条行程" */
  const itineraryLabelMap = useMemo(() => buildItineraryLabelMap(days), [days])
  const itineraryLabelOf = (id: number | null | undefined) =>
    id == null ? null : itineraryLabelMap.get(id) ?? null

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
                    {/*
                      回显"这笔钱绑在哪条行程上"，让用户在花销列表里也能确认归属
                      （未绑定的不显示，避免噪音）。
                    */}
                    {e.itineraryItemId != null && itineraryLabelOf(e.itineraryItemId) && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[var(--m-accent-strong)]">
                        <Icon icon={Link2} size="sm" />
                        {itineraryLabelOf(e.itineraryItemId)}
                      </span>
                    )}
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

      {/* ── AA 结算（主动触发）──────────────────────────────────────
          默认**只展示原始记账数据**；只有点了「一键计算 AA」才计算
          总额 / 人均 / 每人应收应付 / 转账方案。 */}
      <section className="mt-6">
        <div className="flex items-center gap-2">
          <span className="m-section-title mb-0 flex-1">AA 结算</span>
          {aaResult && (
            <button
              type="button"
              onClick={() => setAaResult(null)}
              className="text-[12px] text-[var(--m-faint)]"
            >
              收起结果
            </button>
          )}
        </div>

        <div className="m-card mt-3 p-4">
          <p className="text-[12px] leading-5 text-[var(--m-muted)]">
            默认只记账、不分摊。确认每笔花销的付款人后，点下面的按钮才会计算总额、人均、
            每人应收 / 应付和转账明细。
          </p>

          <Button
            block
            size="lg"
            className="mt-3"
            icon={Calculator}
            onClick={() => {
              const result = buildAaLedger(state?.expenses ?? [], companions)
              if (!result) {
                toast.error('还没有可分摊的花销')
                return
              }
              setAaResult(result)
            }}
          >
            一键计算 AA
          </Button>

          {aaResult && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[var(--m-surface-2)] px-2 py-3 text-center">
                <div>
                  <b className="block text-[17px] font-bold tabular-nums text-[var(--m-text)]">
                    ¥{formatMoney(aaResult.total)}
                  </b>
                  <span className="mt-0.5 block text-[11px] text-[var(--m-faint)]">总花费</span>
                </div>
                <div>
                  <b className="block text-[17px] font-bold tabular-nums text-[var(--m-accent-strong)]">
                    ¥{formatMoney(aaResult.share)}
                  </b>
                  <span className="mt-0.5 block text-[11px] text-[var(--m-faint)]">人均</span>
                </div>
                <div>
                  <b className="block text-[17px] font-bold tabular-nums text-[var(--m-text)]">
                    {aaResult.members.length}
                  </b>
                  <span className="mt-0.5 block text-[11px] text-[var(--m-faint)]">参与人</span>
                </div>
              </div>

              {aaResult.missingPayerCount > 0 && (
                <p className="rounded-xl bg-[var(--m-tone-sun-bg)] px-3 py-2 text-[11px] leading-5 text-[var(--m-tone-sun-fg)]">
                  有 {aaResult.missingPayerCount} 笔（¥{formatMoney(aaResult.missingPayerAmount)}）没填付款人：
                  已计入总额，但无法归属到具体的人，建议补上付款人再算一次。
                </p>
              )}

              <ul className="space-y-2">
                {aaResult.members.map((m) => (
                  <li
                    key={m.name}
                    className="flex items-center gap-2 rounded-xl bg-[var(--m-surface-solid)] px-3 py-2.5 ring-1 ring-[var(--m-line)]"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--m-text)]">
                      {m.name}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-[var(--m-faint)]">
                      已付 ¥{formatMoney(m.paid)}
                    </span>
                    <span
                      className={
                        'shrink-0 text-[12px] font-semibold tabular-nums ' +
                        (m.balance > 0.005
                          ? 'text-[var(--m-success)]'
                          : m.balance < -0.005
                            ? 'text-[var(--m-danger)]'
                            : 'text-[var(--m-faint)]')
                      }
                    >
                      {m.balance > 0.005
                        ? `应收 ¥${formatMoney(m.balance)}`
                        : m.balance < -0.005
                          ? `应付 ¥${formatMoney(-m.balance)}`
                          : '已平'}
                    </span>
                  </li>
                ))}
              </ul>

              <div>
                <p className="text-[12px] font-semibold text-[var(--m-text)]">转账明细</p>
                {aaResult.transfers.length === 0 ? (
                  <p className="mt-1.5 text-[12px] text-[var(--m-faint)]">大家都刚好付清，无需转账。</p>
                ) : (
                  <ul className="mt-1.5 space-y-1.5">
                    {aaResult.transfers.map((t, i) => (
                      <li
                        key={t.from + '-' + t.to + '-' + i}
                        className="flex items-center gap-2 rounded-xl bg-[var(--m-accent-soft)] px-3 py-2 text-[12px] text-[var(--m-accent-strong)]"
                      >
                        <Icon icon={Users} size="sm" />
                        <span className="min-w-0 flex-1 truncate">
                          {t.from} <span className="opacity-60">→</span> {t.to}
                        </span>
                        <b className="shrink-0 tabular-nums">¥{formatMoney(t.amount)}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <AddExpenseSheet
        open={showAdd}
        travelId={travelId}
        days={days}
        companions={companions}
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
  companions = [],
  onClose,
  onDone,
}: {
  open: boolean
  travelId: number
  days: TimelineDay[]
  /** 同行者：付款人快选（AA 要用同一批名字，避免手打出现「小明 / 小明 」两个账号） */
  companions?: CompanionLike[]
  onClose: () => void
  onDone: () => void
}) {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('TRANSPORT')
  const [note, setNote] = useState('')
  const [payer, setPayer] = useState('')
  const [date, setDate] = useState(toDateOnly(new Date().toISOString()))
  /** 选定的行程（'' = 不绑定）。绑定后这笔钱会显示在对应行程与总览里。 */
  const [itineraryItemId, setItineraryItemId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  /**
   * 可选行程列表：把每天的行项目摊平，带上日期便于识别
   * （用户示例：'11/1 高铁 北京→上海'）。
   */
  // 复用与花销列表同一个标签来源（单一事实源，避免两处摊平逻辑漂移）
  const itineraryOptions = useMemo(
    () => Array.from(buildItineraryLabelMap(days), ([id, label]) => ({ id, label })),
    [days],
  )

  /** 付款人快选：同行者名字去重（上限 6 个，避免芯片换行挤爆表单） */
  const payerOptions = useMemo(
    () =>
      Array.from(
        new Set(
          companions
            .map((c) => String(c?.name || '').trim())
            .filter(Boolean),
        ),
      ).slice(0, 6),
    [companions],
  )

  /**
   * 便利行为：切换日期时，若用户**还没手动选过**行程，自动预选当天唯一的行程。
   * 只在天数匹配唯一时预选，避免替用户做错误归属（多行程时不猜）。
   */
  useEffect(() => {
    if (itineraryItemId) return
    if (!date) return
    const sameDay = (days || []).filter((d) => d.date && toDateOnly(d.date) === date)
    const items = sameDay.flatMap((d) => d.itinerary || [])
    if (items.length === 1) setItineraryItemId(String(items[0].id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, days])

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
          // 绑定行程（可选）：服务端会校验该行程属于本旅行
          itineraryItemId: itineraryItemId ? Number(itineraryItemId) : null,
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

        {/* 日期走品牌化日历（单日模式）：原生 type="date" 在 Android 上会弹系统对话框 */}
        <DateField label="日期" value={date} onChange={setDate} />

        {/*
          「选定行程」：把这笔花销挂到某个具体行程上（如 11/1 高铁 北京→上海）。
          选定后该费用会同时出现在「行程」里那条行程下面，以及「总览」的行程费用汇总。
        */}
        {itineraryOptions.length > 0 && (
          // 用品牌化选择器而非原生 select：Android 上原生会拉起系统滚轮下拉，与设计割裂
          <SelectField
            label="选定行程"
            sheetTitle="选择要绑定的行程"
            value={itineraryItemId}
            onChange={setItineraryItemId}
            options={[
              { value: "", label: "不绑定行程", hint: "这笔费用只计入总花销" },
              ...itineraryOptions.map((o) => ({ value: String(o.id), label: o.label })),
            ]}
          />
        )}

        <div>
          <Field label="付款人" placeholder="谁付的这笔钱" value={payer} onChange={(e) => setPayer(e.target.value)} />
          {payerOptions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {payerOptions.map((name) => {
                const active = payer === name
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPayer(active ? '' : name)}
                    className={
                      'min-h-[32px] rounded-full px-3 text-[12px] font-medium transition active:scale-95 ' +
                      (active
                        ? 'bg-[var(--m-accent)] text-white'
                        : 'bg-[var(--m-surface-2)] text-[var(--m-muted)]')
                    }
                  >
                    {name}
                  </button>
                )
              })}
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-[var(--m-faint)]">
            AA 结算会按这里的付款人 + 同行者名单分摊
          </p>
        </div>
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
