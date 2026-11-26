'use client'

import { useEffect, useState } from 'react'
import { MapPin, Save, Sparkles } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { Button } from '@/components/mobile/Button'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { Field, FieldTextarea, FieldSelect } from '@/components/mobile/Field'
import { toast } from '@/lib/mobile/toast-store'
import { apiUrl } from '@/lib/api-base'
import {
  PLAN_STATUSES,
  errorMessageOf,
  planStatusLabelOf,
  type PlanStatus,
  type SpacePlan,
} from './plan-types'

/** ISO → <input type="date"> 需要的 YYYY-MM-DD（按 UTC 取，和创建时一致，避免时区偏移一天） */
function toDateInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/**
 * 发起 / 编辑旅行计划表单（底部抽屉）。
 *
 * 只收「基本信息」：标题、目的地、起止日期、预算、备注（编辑时加状态）。
 * 共享清单不在这里编辑 —— 它在计划详情页按「待办/打包/想去的地方」分组勾选，
 * 那是多人协作的主场景，塞进弹窗会变成一屏表单。
 */
export function SpacePlanComposer({
  open,
  onClose,
  spaceId,
  plan,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  spaceId: number
  /** 传入 = 编辑；不传 = 新建 */
  plan?: SpacePlan | null
  onSaved?: (plan: SpacePlan) => void
}) {
  const editing = Boolean(plan)
  const [title, setTitle] = useState('')
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [budget, setBudget] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<PlanStatus>('PLANNING')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 每次打开都重置为当前 plan（避免上一次的草稿串到另一个计划里）
  useEffect(() => {
    if (!open) return
    setTitle(plan?.title || '')
    setDestination(plan?.destination || '')
    setStartDate(toDateInput(plan?.startDate))
    setEndDate(toDateInput(plan?.endDate))
    setBudget(plan?.budget != null ? String(plan.budget) : '')
    setNote(plan?.note || '')
    setStatus(plan?.status || 'PLANNING')
    setError('')
  }, [open, plan])

  const submit = async () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('给这次旅行起个名字吧')
      return
    }
    if (startDate && endDate && endDate < startDate) {
      setError('结束日期不能早于开始日期')
      return
    }
    setSaving(true)
    setError('')
    const payload = {
      title: trimmedTitle,
      destination: destination.trim() || null,
      startDate: startDate || null,
      endDate: endDate || null,
      budget: toNumberOrNull(budget),
      note: note.trim() || null,
      ...(editing ? { status } : {}),
    }
    try {
      const res = await fetch(
        apiUrl(editing ? `/api/spaces/${spaceId}/plans/${plan!.id}` : `/api/spaces/${spaceId}/plans`),
        {
          method: editing ? 'PATCH' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '保存失败')
      const saved = (json.plan || null) as SpacePlan | null
      if (saved) onSaved?.(saved)
      toast.success(editing ? '计划已更新' : '计划已发起，叫上伙伴一起填清单吧')
      onClose()
    } catch (e) {
      setError(errorMessageOf(e, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? '编辑计划信息' : '发起旅行计划'}
    >
      <div className="space-y-4 pb-2">
        <div className="flex items-start gap-2.5 rounded-[var(--m-radius-control)] bg-[var(--ui-space-accent-soft)] px-3.5 py-2.5">
          <span className="mt-0.5 flex-none text-[var(--ui-space-accent-strong)]">
            <Icon icon={Sparkles} size="sm" />
          </span>
          <p className="text-[13px] leading-5 text-[var(--ui-space-accent-text)]">
            {editing
              ? '改完点保存；共享清单在计划详情里勾选。'
              : '先定下大概的时间与预算，清单可以等大家一起补。'}
          </p>
        </div>

        <Field
          label="计划标题"
          name="plan-title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：去大理看洱海"
          maxLength={200}
        />

        <Field
          label="目的地"
          name="plan-destination"
          leadingIcon={MapPin}
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="例如：云南 · 大理"
          maxLength={200}
        />

        <div className="grid grid-cols-2 gap-3">
          {/* 日期用原生 date 控件：不加前置图标，否则一侧只剩 ~150px 会把 "2027/01/15" 裁掉 */}
          <Field
            label="出发日期"
            name="plan-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Field
            label="结束日期"
            name="plan-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <Field
          label="预算（元）"
          name="plan-budget"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="不填也可以，之后再加"
          hint="转成旅行记录时会一起带过去"
        />

        <FieldTextarea
          label="备注"
          name="plan-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="想去哪、怎么去、有什么约定…"
          maxLength={5000}
        />

        {editing && (
          <FieldSelect
            label="计划状态"
            name="plan-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as PlanStatus)}
          >
            {PLAN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {planStatusLabelOf(s)}
              </option>
            ))}
          </FieldSelect>
        )}

        {error && <p className="text-[13px] text-[var(--danger-soft)]">{error}</p>}

        <Button block size="lg" icon={Save} loading={saving} onClick={() => void submit()}>
          {editing ? '保存修改' : '发起计划'}
        </Button>
      </div>
    </BottomSheet>
  )
}

export default SpacePlanComposer