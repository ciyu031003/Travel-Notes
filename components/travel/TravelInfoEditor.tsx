'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronDown, Loader2, MapPin, Save, X } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import DateRangePicker from './DateRangePicker'
import { toast } from '@/lib/mobile/toast-store'
import { updateTravelInfo } from '@/lib/modules/offline/travel-edit'
import { evaluateDateRange, formatCompactRange, formatRangeSubtitle, suggestLocations } from '@/lib/modules/travel/draft'

/**
 * 「编辑旅行信息」抽屉：改标题 / 目的地 / 日期区间 / 一句话描述。
 *
 * 为什么需要（真实反馈）：「建完旅行之后，这个旅行没法进一步设置」——
 * 此前前台除了新建表单之外**没有任何修改入口**：目的地填错、日期漏填、名字想改
 * 都只能删掉重建，而删除会连带回忆与照片一起没。
 *
 * 交互刻意与新建表单同构（去哪 → 什么时候 → 名字），用户不需要学第二套；
 * 日期改变时服务端会同步对齐「天」（syncTravelDayDates），于是时间线章节跟着走。
 */

/** ISO → `YYYY-MM-DD`（日期输入/比较用；本地时区，避免差一天） */
export function toDateOnly(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function TravelInfoEditor({
  travelId,
  slug,
  initial,
  onClose,
  onSaved,
}: {
  travelId: number | null
  slug: string
  initial: {
    title: string
    location?: string | null
    description?: string | null
    startDate?: string | null
    endDate?: string | null
  }
  onClose: () => void
  /** 保存成功：回传新 slug（改标题时会变）与是否只是本地写入（离线待同步） */
  onSaved?: (info: { slug: string; local: boolean }) => void
}) {
  const [title, setTitle] = useState(initial.title || '')
  const [location, setLocation] = useState(initial.location || '')
  const [description, setDescription] = useState(initial.description || '')
  const [startDate, setStartDate] = useState(toDateOnly(initial.startDate))
  const [endDate, setEndDate] = useState(toDateOnly(initial.endDate))
  const [showPicker, setShowPicker] = useState(false)
  const [locFocus, setLocFocus] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const locationRef = useRef<HTMLDivElement>(null)

  const range = evaluateDateRange(startDate, endDate)
  const compactRange = formatCompactRange(startDate, endDate)
  const subtitle = formatRangeSubtitle(startDate, endDate)
  const locSuggestions = useMemo(() => (locFocus ? suggestLocations(location) : []), [locFocus, location])

  useEffect(() => {
    if (!locFocus) return
    const onDown = (e: MouseEvent) => {
      if (!locationRef.current?.contains(e.target as Node)) setLocFocus(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [locFocus])

  const submit = async () => {
    if (!title.trim()) {
      setError('给这段旅程起个名字吧')
      return
    }
    if (range.error) {
      setError(range.error)
      return
    }
    setSaving(true)
    setError('')
    try {
      const r = await updateTravelInfo({
        travelId,
        slug,
        title: title.trim(),
        location: location.trim(),
        description: description.trim(),
        startDate: startDate || null,
        endDate: endDate || null,
      })
      if (!r.ok) throw new Error(r.error || '保存失败')
      toast.success(r.local ? '已保存到本地，联网后自动同步' : '已保存')
      onSaved?.({ slug: r.slug || slug, local: !!r.local })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="编辑旅行信息">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[var(--m-surface-solid)] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 shadow-[var(--m-shadow-lg)]">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[17px] font-semibold text-[var(--m-text)]">编辑旅行信息</h3>
            <p className="mt-0.5 text-[12px] text-[var(--m-muted)]">改完立即生效，已有的回忆与照片不会丢</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="rounded-full p-2 text-[var(--m-muted)] active:scale-95">
            <Icon icon={X} size="sm" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* 目的地 */}
          <section ref={locationRef}>
            <label htmlFor="edit-travel-location" className="text-[13px] font-semibold text-[var(--m-muted)]">
              去哪？
            </label>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--m-faint)]">
                <Icon icon={MapPin} size="sm" />
              </span>
              <input
                id="edit-travel-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onFocus={() => setLocFocus(true)}
                placeholder="城市或地区，例如 乌鲁木齐"
                maxLength={120}
                autoComplete="off"
                className="w-full rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] py-3.5 pl-10 pr-10 text-[16px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-accent)]"
              />
              {location && (
                <button
                  type="button"
                  onClick={() => setLocation('')}
                  aria-label="清空目的地"
                  className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--m-faint)] active:scale-95"
                >
                  <Icon icon={X} size="sm" />
                </button>
              )}
            </div>
            {locSuggestions.length > 0 && (
              <ul className="mt-2 overflow-hidden rounded-2xl border border-[var(--m-line)]">
                {locSuggestions.map((s, i) => (
                  <li key={s.value}>
                    <button
                      type="button"
                      onClick={() => {
                        setLocation(s.value)
                        setLocFocus(false)
                      }}
                      className={`flex w-full items-center justify-between px-3.5 py-3 text-left text-[15px] text-[var(--m-text)] active:bg-[var(--m-accent-soft)] ${i > 0 ? 'border-t border-[var(--m-line)]' : ''}`}
                    >
                      <span>{s.label}</span>
                      <span className="text-[12px] text-[var(--m-faint)]">{s.nameEn}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 日期区间 */}
          <section>
            <span className="text-[13px] font-semibold text-[var(--m-muted)]">什么时候？</span>
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3.5 text-left active:scale-[0.99]"
            >
              <span className="text-[var(--m-faint)]">
                <Icon icon={CalendarDays} size="sm" />
              </span>
              <span className="min-w-0 flex-1">
                {compactRange ? (
                  <>
                    <span className="block text-[16px] tabular-nums text-[var(--m-text)]">{compactRange}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-[var(--m-muted)]">
                      {range.days != null && `共 ${range.days} 天 ${range.nights} 晚`}
                      {subtitle ? ` · ${subtitle}` : ''}
                    </span>
                  </>
                ) : (
                  <span className="text-[16px] text-[var(--m-faint)]">选择开始与结束日期</span>
                )}
              </span>
              <span className="text-[var(--m-faint)]">
                <Icon icon={ChevronDown} size="sm" />
              </span>
            </button>
            {range.error && <p className="mt-2 text-[12px] text-[var(--m-danger,#d9534f)]">{range.error}</p>}
            {!range.error && compactRange && (
              <p className="mt-2 text-[12px] text-[var(--m-faint)]">改区间会同步调整「按天回顾」的章节日期</p>
            )}
          </section>

          {/* 名字 */}
          <section>
            <label htmlFor="edit-travel-title" className="text-[13px] font-semibold text-[var(--m-muted)]">
              旅程名字
            </label>
            <input
              id="edit-travel-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如 新疆 6 日"
              maxLength={60}
              className="mt-2 w-full rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3.5 text-[16px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-accent)]"
            />
          </section>

          {/* 描述 */}
          <section>
            <label htmlFor="edit-travel-desc" className="text-[13px] font-semibold text-[var(--m-muted)]">
              一句话描述
              <span className="ml-1 font-normal text-[var(--m-faint)]">可选</span>
            </label>
            <textarea
              id="edit-travel-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="想记住的理由"
              className="mt-2 w-full resize-none rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[15px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-accent)]"
            />
          </section>

          {error && (
            <p role="alert" className="text-[13px] text-[var(--m-danger,#d9534f)]">
              {error}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--m-accent)] text-[15px] font-semibold text-[var(--m-on-accent)] transition active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? <Icon icon={Loader2} size="md" className="animate-spin" /> : <Icon icon={Save} size="sm" />}
          {saving ? '保存中…' : '保存'}
        </button>
      </div>

      {showPicker && (
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={({ startDate: s, endDate: e }) => {
            setStartDate(s)
            setEndDate(e)
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
