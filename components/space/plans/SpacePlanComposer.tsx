'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, MapPin, Save, Sparkles } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { Button } from '@/components/mobile/Button'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { Field, FieldTextarea, FieldSelect } from '@/components/mobile/Field'
import { toast } from '@/lib/mobile/toast-store'
import { apiUrl } from '@/lib/api-base'
import { cn } from '@/lib/utils'
import { SpaceSheetGroup, SpaceSheetGroups } from '../SpaceSheetGroup'
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
  /**
   * 「预算与备注」默认收起（新建时）：发起计划的必填信息只有标题，
   * 一上来摊开 6 个字段会让抽屉看起来像一张长表单。编辑已有计划时，
   * 只要填过预算或备注就自动展开，不藏用户已经写过的东西。
   */
  const [advanced, setAdvanced] = useState(false)

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
    setAdvanced(Boolean(plan?.budget != null || (plan?.note && plan.note.length > 0)))
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
      <div className="pb-2">
        {/* 提示条：先说"这一步只要 3 个字段"，用户可以放心地不填其余项 */}
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

        {/* 字段分组：去哪 → 什么时候 → 预算与备注（可选）。
            抽屉打开时三组按 60ms 依次淡入上浮（SpaceSheetGroup），
            键盘避让由 BottomSheet 基座统一处理（useKeyboardInset），这里不重复接。 */}
        <SpaceSheetGroups className="mt-4">
          <SpaceSheetGroup title="这次去哪">
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
          </SpaceSheetGroup>

          <SpaceSheetGroup title="什么时候">
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
          </SpaceSheetGroup>

          {editing && (
            <SpaceSheetGroup title="状态">
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
            </SpaceSheetGroup>
          )}

          {/* 可选区：默认收起，点开时用 CSS grid-template-rows 0fr→1fr 展开。
              这是全模块唯一一处布局轨道动画，只出现在"用户主动点开"的一次性动作里，
              不在滚动/列表路径上，因此不会造成持续的 layout 抖动；减动效时直接显隐。 */}
          <div id="plan-advanced-fields" className={cn('space-disclosure', advanced && 'is-open')}>
            <div className="space-disclosure-inner">
              <div className="space-disclosure-pad space-y-3">
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
              </div>
            </div>
          </div>
        </SpaceSheetGroups>

        {/* 展开/收起开关：放在可选区上方会随内容跳动，放在其下方最稳 */}
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          aria-expanded={advanced}
          aria-controls="plan-advanced-fields"
          className="m-pressable mt-3 flex w-full items-center justify-between gap-2 rounded-2xl bg-[var(--ui-social-surface-50)] px-3.5 py-2.5 text-[13px] text-[var(--ui-social-muted)]"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className={cn('space-disclosure-caret', advanced && 'is-open')}>
              <Icon icon={ChevronDown} size="sm" />
            </span>
            预算与备注
            <span className="text-[11px] text-[var(--ui-social-faint)]">可选</span>
          </span>
          <span className="text-[11px] text-[var(--ui-social-faint)]">{advanced ? '收起' : '展开'}</span>
        </button>

        {error && <p className="mt-3 text-[13px] text-[var(--danger-soft)]">{error}</p>}

        <Button block size="lg" icon={Save} loading={saving} onClick={() => void submit()} className="mt-4">
          {editing ? '保存修改' : '发起计划'}
        </Button>
      </div>
    </BottomSheet>
  )
}

export default SpacePlanComposer