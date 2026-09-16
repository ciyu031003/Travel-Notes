'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CalendarDays, Check, ChevronDown, Loader2, MapPin, Plus, X } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import DateRangePicker from './DateRangePicker'
import { useTravelDraft } from '@/hooks/use-travel-draft'
import {
  COMMON_RELATIONS,
  MAX_COMPANIONS,
  TRAVEL_TYPE_OPTIONS,
  formatCompactRange,
  formatRangeSubtitle,
  moreSectionSummary,
  suggestLocations,
} from '@/lib/modules/travel/draft'

/**
 * 新建旅行表单（全屏）
 *
 * 设计依据：docs/design/新建旅行重构方案-参考圆周旅迹.md
 * 参考的是**交互模式**（目的地+日期先定 / 日期区间一处选完并实时算天数 /
 * 行内 ＋ 追加 / 折叠更多 / 建完进详情），视觉仍用行迹自己的 `--m-*` 暖色 token。
 *
 * 三条关键信息层级：
 *   去哪 → 什么时候 → 给这段旅程起个名字（必填只有第三项，且由前两项自动长出来）
 * 其余全部收进「更多（可选）」。
 */
export default function TravelComposerForm({
  onBack,
  onCreated,
}: {
  onBack: () => void
  /**
   * 创建成功回调。`slug` 为云端 slug（离线本地保存时为 null）。
   * 由调用方决定落地页：有 slug → 进 /travel/<slug>；否则回列表。
   */
  onCreated?: (info: { slug: string | null; local: boolean }) => void
}) {
  const {
    draft, patch, suggestions, submitting, error,
    validation, addCompanion, removeCompanion, submit,
  } = useTravelDraft(true)

  const [showPicker, setShowPicker] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [locFocus, setLocFocus] = useState(false)
  const [companionName, setCompanionName] = useState('')
  const [companionRelation, setCompanionRelation] = useState('')
  const [succeeded, setSucceeded] = useState(false)

  const locationRef = useRef<HTMLDivElement>(null)
  const locInputRef = useRef<HTMLInputElement>(null)

  // 进页面即聚焦目的地：键盘弹起就能打字（参考产品那种"打开就开始"的轻盈感）
  useEffect(() => {
    const t = window.setTimeout(() => locInputRef.current?.focus(), 120)
    return () => window.clearTimeout(t)
  }, [])

  const locSuggestions = useMemo(
    () => (locFocus ? suggestLocations(draft.location) : []),
    [locFocus, draft.location],
  )

  // 点空白处收起联想
  useEffect(() => {
    if (!locFocus) return
    const onDown = (e: MouseEvent) => {
      if (!locationRef.current?.contains(e.target as Node)) setLocFocus(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [locFocus])

  const rangeInfo = { days: validation.days, nights: validation.nights }
  const subtitle = formatRangeSubtitle(draft.startDate, draft.endDate)
  const compactRange = formatCompactRange(draft.startDate, draft.endDate)
  const moreSummary = moreSectionSummary(draft)
  const atCompanionLimit = draft.companions.length >= MAX_COMPANIONS

  const handleSubmit = async () => {
    const r = await submit()
    if (!r.ok) return
    setSucceeded(true)
    // 让「已创建」可见一瞬，再交给调用方决定去哪（不直接跳，否则用户看不到确认）
    window.setTimeout(() => onCreated?.({ slug: r.slug, local: r.local }), 550)
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--m-bg)] text-[var(--m-text)]">
      {/* 顶栏：返回 + 居中标题。不放多余动作，把注意力留给表单 */}
      <header
        className="sticky top-0 z-20 flex items-center gap-2 px-2 pt-[max(8px,env(safe-area-inset-top))] pb-2 backdrop-blur-md"
        style={{ background: 'color-mix(in srgb, var(--m-bg) 86%, transparent)' }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="返回"
          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--m-text)] transition active:scale-95"
        >
          <Icon icon={ArrowLeft} size="md" />
        </button>
        <h1 className="flex-1 text-center text-[17px] font-semibold">新建旅行</h1>
        <span className="h-11 w-11" aria-hidden="true" />
      </header>

      <main className="px-4 pb-[calc(120px+env(safe-area-inset-bottom))]">
        <form
          onSubmit={(e) => { e.preventDefault(); void handleSubmit() }}
          className="space-y-4"
        >
          {/* ── ① 去哪 ─────────────────────────────────── */}
          <section ref={locationRef} className="m-card p-4">
            <label htmlFor="travel-location" className="text-[13px] font-semibold text-[var(--m-muted)]">
              去哪？
            </label>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--m-faint)]">
                <Icon icon={MapPin} size="sm" />
              </span>
              <input
                id="travel-location"
                ref={locInputRef}
                value={draft.location}
                onChange={(e) => patch({ location: e.target.value })}
                onFocus={() => setLocFocus(true)}
                placeholder="城市或地区，例如 乌鲁木齐"
                maxLength={120}
                autoComplete="off"
                enterKeyHint="next"
                className="w-full rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] py-3.5 pl-10 pr-10 text-[16px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-accent)]"
              />
              {draft.location && (
                <button
                  type="button"
                  onClick={() => { patch({ location: '' }); locInputRef.current?.focus() }}
                  aria-label="清空目的地"
                  className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--m-faint)] active:scale-95"
                >
                  <Icon icon={X} size="sm" />
                </button>
              )}
            </div>

            {/* 联想：用既有城市库（与画册 findCityByName 同一份数据） */}
            {locSuggestions.length > 0 && (
              <ul className="mt-2 overflow-hidden rounded-2xl border border-[var(--m-line)]">
                {locSuggestions.map((s, i) => (
                  <li key={s.value}>
                    <button
                      type="button"
                      onClick={() => { patch({ location: s.value }); setLocFocus(false) }}
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

          {/* ── ② 什么时候 ─────────────────────────────── */}
          <section className="m-card p-4">
            <span className="text-[13px] font-semibold text-[var(--m-muted)]">什么时候？</span>
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3.5 text-left active:scale-[0.99]"
            >
              <span className="text-[var(--m-faint)]"><Icon icon={CalendarDays} size="sm" /></span>
              <span className="min-w-0 flex-1">
                {compactRange ? (
                  <>
                    <span className="block text-[16px] tabular-nums text-[var(--m-text)]">{compactRange}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-[var(--m-muted)]">
                      {rangeInfo.days != null && `共 ${rangeInfo.days} 天 ${rangeInfo.nights} 晚`}
                      {subtitle ? ` · ${subtitle}` : ''}
                    </span>
                  </>
                ) : (
                  <span className="text-[16px] text-[var(--m-faint)]">选择开始与结束日期</span>
                )}
              </span>
              <span className="text-[var(--m-faint)]"><Icon icon={ChevronDown} size="sm" /></span>
            </button>
            {validation.dateError && (
              <p className="mt-2 text-[12px] text-[var(--m-danger,#d9534f)]">{validation.dateError}</p>
            )}
          </section>

          {/* ── ③ 名字（必填，但由前两项自动长出来） ──────── */}
          <section className="m-card p-4">
            <label htmlFor="travel-title" className="text-[13px] font-semibold text-[var(--m-muted)]">
              给这段旅程起个名字
            </label>
            <input
              id="travel-title"
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="例如 新疆 6 日"
              maxLength={60}
              enterKeyHint="done"
              className="mt-2 w-full rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3.5 text-[16px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-accent)]"
            />
            {suggestions.length > 1 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-[var(--m-faint)]">换个说法</span>
                {suggestions.slice(1).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => patch({ title: s })}
                    className="rounded-full border border-[var(--m-line)] px-3 py-1.5 text-[13px] text-[var(--m-muted)] active:scale-95"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── ④ 更多（可选，默认收起） ─────────────────── */}
          <section className="m-card overflow-hidden">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              aria-expanded={showMore}
              className="flex w-full items-center gap-2 px-4 py-4 text-left"
            >
              <span className="text-[13px] font-semibold text-[var(--m-muted)]">更多</span>
              <span className="text-[12px] text-[var(--m-faint)]">可选</span>
              {!showMore && moreSummary && (
                <span className="ml-auto truncate text-[12px] text-[var(--m-accent-strong)]">{moreSummary}</span>
              )}
              <span className={`ml-auto shrink-0 text-[var(--m-faint)] transition-transform ${showMore ? 'rotate-180' : ''}`}>
                <Icon icon={ChevronDown} size="sm" />
              </span>
            </button>

            {showMore && (
              <div className="space-y-5 border-t border-[var(--m-line)] px-4 py-4">
                {/* 类型：2 列网格 + 图标语义 + 一句说明（原先 7 个胶囊挤一行、无说明） */}
                <div>
                  <p className="text-[13px] font-semibold text-[var(--m-muted)]">这次旅行是？</p>
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    {TRAVEL_TYPE_OPTIONS.map((t) => {
                      const active = draft.travelType === t.value
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => patch({ travelType: t.value })}
                          aria-pressed={active}
                          className={`flex min-h-[56px] flex-col items-start justify-center rounded-2xl border px-3 py-2 text-left transition active:scale-[0.98] ${
                            active
                              ? 'border-[var(--m-accent)] bg-[var(--m-accent-soft)]'
                              : 'border-[var(--m-line)]'
                          }`}
                        >
                          <span className={`text-[14px] font-medium ${active ? 'text-[var(--m-accent-strong)]' : 'text-[var(--m-text)]'}`}>
                            {t.label}
                          </span>
                          <span className="mt-0.5 text-[11px] text-[var(--m-faint)]">{t.hint}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 同行者：单输入框 + 行内追加 + 常用关系快捷 */}
                <div>
                  <p className="text-[13px] font-semibold text-[var(--m-muted)]">
                    和谁一起去的？
                    <span className="ml-1 font-normal text-[var(--m-faint)]">最多 {MAX_COMPANIONS} 人</span>
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <input
                      value={companionName}
                      onChange={(e) => setCompanionName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return
                        e.preventDefault()
                        addCompanion(companionName, companionRelation)
                        setCompanionName('')
                      }}
                      placeholder="姓名或称呼"
                      maxLength={40}
                      enterKeyHint="done"
                      disabled={atCompanionLimit}
                      className="min-w-0 flex-1 rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[15px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-accent)] disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => { addCompanion(companionName, companionRelation); setCompanionName('') }}
                      disabled={!companionName.trim() || atCompanionLimit}
                      className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-2xl bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)] active:scale-95 disabled:opacity-40"
                      aria-label="添加同行者"
                    >
                      <Icon icon={Plus} size="sm" />
                    </button>
                  </div>

                  {/* 常用关系：一键套用，省掉每个人都要现打关系 */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {COMMON_RELATIONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCompanionRelation(companionRelation === r ? '' : r)}
                        aria-pressed={companionRelation === r}
                        className={`rounded-full border px-2.5 py-1 text-[12px] transition ${
                          companionRelation === r
                            ? 'border-[var(--m-accent)] bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]'
                            : 'border-[var(--m-line)] text-[var(--m-faint)]'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>

                  {draft.companions.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {draft.companions.map((c, i) => (
                        <span
                          key={`${c.name}-${i}`}
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--m-line)] px-3 py-1.5 text-[13px] text-[var(--m-text)]"
                        >
                          {c.name}
                          {c.relation ? <span className="text-[var(--m-faint)]">· {c.relation}</span> : null}
                          <button
                            type="button"
                            onClick={() => removeCompanion(i)}
                            aria-label={`移除 ${c.name}`}
                            className="ml-0.5 rounded-full p-0.5 text-[var(--m-faint)] active:scale-95"
                          >
                            <Icon icon={X} size="sm" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 描述 */}
                <div>
                  <label htmlFor="travel-desc" className="text-[13px] font-semibold text-[var(--m-muted)]">一句话描述</label>
                  <textarea
                    id="travel-desc"
                    value={draft.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    rows={3}
                    placeholder="想记住的理由（可选）"
                    className="mt-2.5 w-full resize-none rounded-2xl border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3.5 py-3 text-[15px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-accent)]"
                  />
                </div>

                {/* 可见性：默认仅自己，且明确告知（原先表单完全没有这一项，用户不知道是私密的） */}
                <div>
                  <p className="text-[13px] font-semibold text-[var(--m-muted)]">谁能看到</p>
                  <div className="mt-2.5 flex gap-2">
                    {[
                      { v: false, label: '仅自己', hint: '默认' },
                      { v: true, label: '公开', hint: '所有人可见' },
                    ].map((o) => {
                      const active = draft.isPublic === o.v
                      return (
                        <button
                          key={String(o.v)}
                          type="button"
                          onClick={() => patch({ isPublic: o.v })}
                          aria-pressed={active}
                          className={`flex-1 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.98] ${
                            active ? 'border-[var(--m-accent)] bg-[var(--m-accent-soft)]' : 'border-[var(--m-line)]'
                          }`}
                        >
                          <span className={`block text-[14px] font-medium ${active ? 'text-[var(--m-accent-strong)]' : 'text-[var(--m-text)]'}`}>
                            {o.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-[var(--m-faint)]">{o.hint}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>

          {error && (
            <p role="alert" className="px-1 text-[13px] text-[var(--m-danger,#d9534f)]">{error}</p>
          )}

          {/* ── 底部固定操作条（键盘弹起时随之上移） ─────── */}
          <div
            className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 -mx-4 px-4 pt-3"
            style={{ background: 'linear-gradient(to top, var(--m-bg) 78%, transparent)' }}
          >
            {!validation.canSubmit && validation.blocker && (
              <p className="mb-2 text-center text-[12px] text-[var(--m-faint)]">{validation.blocker}</p>
            )}
            <button
              type="submit"
              disabled={submitting || succeeded || !validation.canSubmit}
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--m-accent)] text-[16px] font-semibold text-[var(--m-on-accent)] shadow-[var(--m-shadow-lg)] transition active:scale-[0.98] disabled:opacity-50"
            >
              {succeeded
                ? <><Icon icon={Check} size="md" />已创建</>
                : submitting
                  ? <><Icon icon={Loader2} size="md" className="animate-spin" />正在创建…</>
                  : '开始记录'}
            </button>
          </div>
        </form>
      </main>

      {showPicker && (
        <DateRangePicker
          startDate={draft.startDate}
          endDate={draft.endDate}
          onChange={({ startDate, endDate }) => patch({ startDate, endDate })}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
