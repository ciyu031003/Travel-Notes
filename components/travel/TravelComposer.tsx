'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Check, ChevronDown, Loader2, Plus, X } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import DateRangePicker from './DateRangePicker'
import { useTravelDraft } from '@/hooks/use-travel-draft'
import { apiUrl } from '@/lib/api-base'
import {
  TRAVEL_TYPE_OPTIONS,
  formatCompactRange,
  formatRangeSubtitle,
} from '@/lib/modules/travel/draft'

/**
 * 新建旅行（弹窗形态，桌面 Web 与「我的旅行」页内的触发器用）。
 *
 * 移动端主入口是 /travel/new 的全屏页（`TravelComposerForm`），两者共用
 * `useTravelDraft` 的状态与提交逻辑，避免原先两套重复 JSX 漂移。
 * 这里只保留"紧凑一屏"的取舍：目的地 / 日期 / 名称 + 类型四组，
 * 同行者与描述引导到全屏页（窄弹窗塞不下行内追加的交互）。
 */
export default function TravelComposer({
  onCreated,
  autoOpen = false,
  hideTrigger = false,
}: {
  onCreated?: () => void
  autoOpen?: boolean
  hideTrigger?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(autoOpen)
  const [showPicker, setShowPicker] = useState(false)
  const [succeeded, setSucceeded] = useState(false)
  const {
    draft, patch, submitting, error,
    validation, reset, submit,
  } = useTravelDraft(open)

  useEffect(() => {
    if (autoOpen) setOpen(true)
  }, [autoOpen])

  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => titleRef.current?.focus(), 120)
    return () => window.clearTimeout(t)
  }, [open])

  const subtitle = useMemo(
    () => formatRangeSubtitle(draft.startDate, draft.endDate),
    [draft.startDate, draft.endDate],
  )
  const compactRange = formatCompactRange(draft.startDate, draft.endDate)

  const close = () => {
    setOpen(false)
    setSucceeded(false)
  }

  /** 桌面弹窗保持"回列表"语义（与旧行为一致，避免打扰既有 E2E 与桌面习惯） */
  const handleSubmit = async () => {
    const r = await submit()
    if (!r.ok) return
    setSucceeded(true)
    window.setTimeout(() => {
      reset()
      close()
      onCreated?.()
      // 详情页需要 slug；弹窗路径仅在拿到 slug 时进入，否则留在列表（旧行为）
      if (r.slug) router.push(`/travel/${encodeURIComponent(r.slug)}`)
    }, 550)
  }

  // 游客可浏览公开内容，但记录自己的旅行需登录（M0 · 产品规则）
  const tryOpen = async () => {
    try {
      const res = await fetch(apiUrl('/api/check-auth'), { credentials: 'include' })
      const data = await res.json().catch(() => null)
      if (data && data.authenticated) setOpen(true)
      else router.push('/login?redirect=/travel')
    } catch {
      router.push('/login?redirect=/travel')
    }
  }

  if (!open) {
    if (hideTrigger) return null
    return (
      <button
        type="button"
        onClick={tryOpen}
        className="inline-flex items-center gap-1.5 rounded-full bg-travel-accent px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-travel-accentStrong"
      >
        <Icon icon={Plus} size="sm" />
        新建旅行
      </button>
    )
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void handleSubmit() }}
      className="relative w-full max-w-md rounded-2xl border border-travel-dim bg-travel-cream p-4 shadow-lg"
    >
      <button
        type="button"
        onClick={close}
        className="absolute right-2 top-2 rounded-full p-1 text-travel-ink/50 hover:bg-travel-dim/50"
        aria-label="关闭"
      >
        <Icon icon={X} size="sm" />
      </button>
      <h3 className="mb-3 font-semibold text-travel-ink">新建旅行</h3>

      <div className="space-y-3">
        {/* 目的地：原先弹窗里没有这一项，导致旅行无法归入城市画册 */}
        <label className="block">
          <span className="mb-1 block text-xs text-travel-ink/60">去哪？</span>
          <input
            value={draft.location}
            onChange={(e) => patch({ location: e.target.value })}
            placeholder="城市或地区，例如 乌鲁木齐"
            maxLength={120}
            className="w-full rounded-xl border border-travel-dim/70 bg-white px-3 py-2 text-sm text-travel-ink outline-none placeholder:text-travel-ink/40 focus:border-travel-accent"
          />
        </label>

        {/* 日期：一处选完并回显天数（替换原先两个原生 date 控件） */}
        <div>
          <span className="mb-1 block text-xs text-travel-ink/60">什么时候？</span>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="flex w-full items-center gap-2 rounded-xl border border-travel-dim/70 bg-white px-3 py-2 text-left"
          >
            <span className="text-travel-ink/50"><Icon icon={CalendarDays} size="sm" /></span>
            <span className="min-w-0 flex-1">
              {compactRange ? (
                <>
                  <span className="block text-sm tabular-nums text-travel-ink">{compactRange}</span>
                  <span className="block truncate text-xs text-travel-ink/50">
                    {validation.days != null && `共 ${validation.days} 天 ${validation.nights} 晚`}
                    {subtitle ? ` · ${subtitle}` : ''}
                  </span>
                </>
              ) : (
                <span className="text-sm text-travel-ink/40">选择开始与结束日期</span>
              )}
            </span>
            <span className="text-travel-ink/40"><Icon icon={ChevronDown} size="sm" /></span>
          </button>
          {validation.dateError && (
            <p className="mt-1 text-xs text-travel-danger">{validation.dateError}</p>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-travel-ink/60">旅行名称</span>
          <input
            ref={titleRef}
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="例如 乌鲁木齐 6 日"
            maxLength={60}
            className="w-full rounded-xl border border-travel-dim/70 bg-white px-3 py-2 text-sm text-travel-ink outline-none placeholder:text-travel-ink/40 focus:border-travel-accent"
          />
        </label>

        {/* 类型：改成两列网格（原先 7 个胶囊换行挤压） */}
        <div>
          <span className="mb-1.5 block text-xs text-travel-ink/60">这次旅行是？</span>
          <div className="grid grid-cols-3 gap-1.5">
            {TRAVEL_TYPE_OPTIONS.filter((t) => t.value !== 'OTHER').map((t) => {
              const active = draft.travelType === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => patch({ travelType: t.value })}
                  aria-pressed={active}
                  className={`rounded-xl px-2 py-2 text-xs font-medium transition ${
                    active
                      ? 'bg-travel-accent text-white'
                      : 'bg-travel-dim/40 text-travel-ink/70 hover:bg-travel-dim/70'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => { close(); router.push('/travel/new') }}
          className="w-full rounded-xl border border-dashed border-travel-dim/70 py-2 text-xs text-travel-ink/60 hover:bg-travel-dim/30"
        >
          需要填写同行者 / 描述？用完整页面 ›
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {error && <p className="text-xs text-travel-danger">{error}</p>}
        <button
          type="submit"
          disabled={submitting || succeeded || !validation.canSubmit}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-travel-accent px-4 py-1.5 text-sm font-medium text-white transition hover:bg-travel-accentStrong disabled:opacity-50"
        >
          {succeeded
            ? <><Icon icon={Check} size="sm" />已创建</>
            : submitting
              ? <Icon icon={Loader2} size="sm" className="animate-spin" />
              : <Icon icon={Plus} size="sm" />}
          {!succeeded && !submitting && '保存'}
        </button>
      </div>

      {showPicker && (
        <DateRangePicker
          startDate={draft.startDate}
          endDate={draft.endDate}
          onChange={({ startDate, endDate }) => patch({ startDate, endDate })}
          onClose={() => setShowPicker(false)}
        />
      )}
    </form>
  )
}
