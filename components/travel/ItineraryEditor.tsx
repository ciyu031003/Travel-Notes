'use client'

import { useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { apiUrl } from '@/lib/api-base'
import { toast } from '@/lib/mobile/toast-store'

/**
 * 「添加行程」抽屉：给某一天加一个景点 / 餐厅 / 住宿 / 交通 / 活动。
 *
 * 为什么需要：`ItineraryItem` 表与 `POST /api/admin/travels/:id/itinerary` 早就有了，
 * 但**前台完全没有入口**（只有后台 admin 能用），所以用户在 App 里根本没法记"去了哪玩"。
 *
 * 时间只收 HH:mm，服务端 `parseTimeOrDate` 会补成当天日期。
 */

const TYPES: { value: string; label: string; hint: string }[] = [
  { value: 'SPOT', label: '景点', hint: '打卡的地方' },
  { value: 'RESTAURANT', label: '餐厅', hint: '吃了什么' },
  { value: 'HOTEL', label: '住宿', hint: '住哪儿' },
  { value: 'TRANSPORT', label: '交通', hint: '怎么去的' },
  { value: 'ACTIVITY', label: '活动', hint: '玩了什么' },
  { value: 'OTHER', label: '其他', hint: '其他安排' },
]

export default function ItineraryEditor({
  travelId,
  dayId,
  dayLabel,
  onClose,
  onDone,
}: {
  travelId: number
  dayId: number
  /** 形如「DAY 01 · 08.14」，用于标题 */
  dayLabel: string
  onClose: () => void
  onDone?: () => void
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('SPOT')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!title.trim()) {
      setError('写个名字吧，比如「喀纳斯湖」')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(apiUrl(`/api/travels/${travelId}/itinerary`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayId,
          title: title.trim(),
          type,
          startTime: startTime ? `${startTime}:00` : undefined,
          endTime: endTime ? `${endTime}:00` : undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '保存失败')
      toast.success('已添加')
      onDone?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="添加行程">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[var(--m-surface-solid)] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 shadow-[var(--m-shadow-lg)]">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[17px] font-semibold text-[var(--m-text)]">添加行程</h3>
            <p className="mt-0.5 text-[12px] text-[var(--m-muted)]">{dayLabel}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="rounded-full p-2 text-[var(--m-muted)] active:scale-95">
            <Icon icon={X} size="sm" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-[13px] font-semibold text-[var(--m-muted)]">去哪 / 做了什么</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如 喀纳斯湖"
              maxLength={120}
              className="mt-2 w-full rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[16px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-accent)]"
            />
          </label>

          <div>
            <span className="text-[13px] font-semibold text-[var(--m-muted)]">类型</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {TYPES.map((t) => {
                const active = type === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    aria-pressed={active}
                    className={`rounded-2xl border px-2 py-2.5 text-left transition active:scale-[0.98] ${
                      active ? 'border-[var(--m-accent)] bg-[var(--m-accent-soft)]' : 'border-[var(--m-line)]'
                    }`}
                  >
                    <span className={`block text-[13px] font-medium ${active ? 'text-[var(--m-accent-strong)]' : 'text-[var(--m-text)]'}`}>
                      {t.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-[var(--m-faint)]">{t.hint}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <label className="flex-1">
              <span className="text-[13px] font-semibold text-[var(--m-muted)]">开始</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[15px] text-[var(--m-text)] outline-none focus:border-[var(--m-accent)]"
              />
            </label>
            <label className="flex-1">
              <span className="text-[13px] font-semibold text-[var(--m-muted)]">结束</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[15px] text-[var(--m-text)] outline-none focus:border-[var(--m-accent)]"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[13px] font-semibold text-[var(--m-muted)]">备注</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="门票、路线、感受……（可选）"
              className="mt-2 w-full resize-none rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[15px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-accent)]"
            />
          </label>

          {error && <p role="alert" className="text-[13px] text-[var(--m-danger,#d9534f)]">{error}</p>}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--m-accent)] text-[15px] font-semibold text-[var(--m-on-accent)] transition active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? <Icon icon={Loader2} size="md" className="animate-spin" /> : <Icon icon={Plus} size="sm" />}
          {saving ? '保存中…' : '添加行程'}
        </button>
      </div>
    </div>
  )
}
