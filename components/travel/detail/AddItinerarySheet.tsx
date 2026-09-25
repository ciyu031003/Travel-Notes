'use client'

import { useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { Button } from '@/components/mobile/Button'
import { Field, FieldTextarea } from '@/components/mobile/Field'
import { Icon } from '@/components/mobile/Icon'
import { ITINERARY_TYPES, itineraryIconOf, itineraryLabelOf } from '@/lib/mobile/icon-system'
import { apiUrl } from '@/lib/api-base'
import { toast } from '@/lib/mobile/toast-store'
import { formatTime, dayFullLabel } from './format'
import type { TimelineDay, TimelineItineraryItem } from './types'

/**
 * 「添加 / 编辑行程」抽屉。
 *
 * 对齐参考产品的两件事：
 *  1. **先明确加到哪一天**（顶部「添加到 DAY 03 · 10.01 周四」，可就地切换）——
 *     参考产品抽屉顶部就是这个选择器；否则用户在"全部天"视图里加东西会不知道落哪。
 *  2. **类型先选**（景点/餐厅/住宿/交通/活动/其他 六宫格），而不是先敲标题。
 *
 * 同时补上此前缺失的**编辑与删除**（前台原先只有 POST，加错了删不掉也改不了）。
 */
export default function AddItinerarySheet({
  open,
  travelId,
  days,
  defaultDayId,
  editing,
  onClose,
  onDone,
}: {
  open: boolean
  travelId: number
  days: TimelineDay[]
  defaultDayId?: number | null
  /** 传入即为编辑模式（此时不再允许换天：换天等于换归属，超出本次范围） */
  editing?: { dayId: number; item: TimelineItineraryItem } | null
  onClose: () => void
  onDone: () => void
}) {
  const [dayId, setDayId] = useState<number | null>(editing?.dayId ?? defaultDayId ?? days[0]?.id ?? null)
  const [title, setTitle] = useState(editing?.item.title ?? '')
  const [type, setType] = useState(editing?.item.type ?? 'SPOT')
  const [startTime, setStartTime] = useState(formatTime(editing?.item.startTime) || '')
  const [endTime, setEndTime] = useState(formatTime(editing?.item.endTime) || '')
  const [notes, setNotes] = useState(editing?.item.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isEdit = Boolean(editing)
  const dayIndex = days.findIndex((d) => d.id === dayId)

  const submit = async () => {
    if (!title.trim()) {
      setError('写个名字吧，比如「喀纳斯湖」')
      return
    }
    if (dayId == null) {
      setError('请选择加到哪一天')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        title: title.trim(),
        type,
        startTime: startTime ? `${startTime}:00` : null,
        endTime: endTime ? `${endTime}:00` : null,
        notes: notes.trim() || null,
      }
      const res = await fetch(
        isEdit
          ? apiUrl(`/api/travels/${travelId}/itinerary/${editing!.item.id}`)
          : apiUrl(`/api/travels/${travelId}/itinerary`),
        {
          method: isEdit ? 'PATCH' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isEdit ? payload : { ...payload, dayId }),
        },
      )
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '保存失败')
      toast.success(isEdit ? '已保存' : '已添加')
      onDone()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!isEdit) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/travels/${travelId}/itinerary/${editing!.item.id}`), {
        method: 'DELETE',
        credentials: 'include',
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '删除失败')
      toast.success('已删除')
      onDone()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={isEdit ? '编辑行程' : '添加行程'}>
      <div className="space-y-4">
        {/* 加到哪天（编辑时锁定） */}
        {!isEdit && days.length > 1 && (
          <div>
            <p className="m-field-label">添加到</p>
            <div className="-mx-1 mt-1.5 flex gap-2 overflow-x-auto px-1 pb-1">
              {days.map((d, i) => {
                const active = d.id === dayId
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setDayId(d.id)}
                    className={
                      'm-chip shrink-0 ' + (active ? 'm-chip-active' : '')
                    }
                  >
                    {dayFullLabel(d.date, i)}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {isEdit && dayIndex >= 0 && (
          <p className="m-caption text-[var(--m-muted)]">{dayFullLabel(days[dayIndex].date, dayIndex)}</p>
        )}

        <Field
          label="去哪 / 做了什么"
          placeholder="例如 喀纳斯湖"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
        />

        {/* 类型先选：六宫格，图标 + 名称（对齐参考产品的"添加"入口分组） */}
        <div>
          <p className="m-field-label">类型</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {ITINERARY_TYPES.map((t) => {
              const active = type === t
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setType(t)}
                  className={
                    'flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl border transition active:scale-[0.98] ' +
                    (active
                      ? 'border-[var(--m-accent)] bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]'
                      : 'border-[var(--m-line)] text-[var(--m-text)]')
                  }
                >
                  <Icon icon={itineraryIconOf(t)} size="md" />
                  <span className="text-[12px] font-medium">{itineraryLabelOf(t)}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex gap-3">
          <Field
            className="flex-1"
            label="开始"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
          <Field
            className="flex-1"
            label="结束"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>

        <FieldTextarea
          label="备注"
          rows={2}
          placeholder="门票、路线、感受……（可选）"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {error && (
          <p role="alert" className="text-[13px] text-[var(--m-danger)]">
            {error}
          </p>
        )}

        <Button block size="lg" loading={saving} icon={isEdit ? undefined : Plus} onClick={submit}>
          {isEdit ? '保存' : '添加行程'}
        </Button>

        {isEdit && (
          <Button block variant="danger" icon={Trash2} disabled={saving} onClick={remove}>
            删除这条行程
          </Button>
        )}
      </div>
    </BottomSheet>
  )
}
