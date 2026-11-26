'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CalendarDays, Check, ChevronDown, MapPin, Plus, Sparkles, X } from '@/lib/mobile/icon-system'
import { Button } from '@/components/mobile/Button'
import { Icon } from '@/components/mobile/Icon'
import { toast } from '@/lib/mobile/toast-store'
import { EXPENSE_CATEGORIES, EXPENSE_LABELS, type ExpenseCategory } from '@/lib/modules/travel/expense-categories'
import { useKeyboardInset } from '@/hooks/use-keyboard-inset'
import DateRangePicker from './DateRangePicker'
import { apiUrl } from '@/lib/api-base'
import { useTravelDraft } from '@/hooks/use-travel-draft'
import {
  COMMON_RELATIONS,
  MAX_COMPANIONS,
  TRAVEL_TYPE_OPTIONS,
  formatCompactRange,
  formatRangeSubtitle,
  moreSectionSummary,
  roleMixOf,
  suggestLocations,
} from '@/lib/modules/travel/draft'

/**
 * 新建旅行表单（全屏）
 *
 * 设计依据：docs/design/新建旅行重构方案-参考圆周旅迹.md
 * 参考的是**交互模式**（目的地+日期先定 / 日期区间一处选完并实时算天数 /
 * 行内 ＋ 追加 / 折叠更多 / 建完进详情），视觉仍用甜途自己的 `--m-*` 暖色 token。
 *
 * 三条关键信息层级：
 *   去哪 → 什么时候 → 给这段旅程起个名字（必填只有第三项，且由前两项自动长出来）
 * 其余全部收进「更多（可选）」。
 */
/** 创建前暂存的一笔花销（只在前端草稿里，创建成功后才落库） */
type DraftExpense = {
  id: string
  amount: number
  note: string
  payer: string
  category: ExpenseCategory
}

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
    draft, patch, patchSystem, suggestions, submitting, error,
    validation, addCompanion, removeCompanion, submit,
  } = useTravelDraft(true)

  const [showPicker, setShowPicker] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [locFocus, setLocFocus] = useState(false)
  const [companionName, setCompanionName] = useState('')
  const [companionRelation, setCompanionRelation] = useState('')
  const [succeeded, setSucceeded] = useState(false)
  // 粘底保存条在移动 Web 下要自己避让键盘（原生壳里 insets 会压视口，值≈0 不干扰）
  const keyboardInset = useKeyboardInset()
  /**
   * 主 CTA 的滚动收起：
   *  · 之前是 sticky，表单内容不够长时按钮会停在屏幕中部（真机反馈"卡在偏上方"）；
   *  · 现在固定在底部导航之上，向下滚动缩小淡出、向上滚动放大回来，到底部保持收起。
   */
  const [ctaHidden, setCtaHidden] = useState(false)

  /* ── 旅途花销 ▌创建前就能先记原始账 ────────────────────────────────
     只存本地草稿；CU 建完行程、拿到云端 id 后再逐笔 POST。
     分摊（AA）不在这里算 —— 用户必须在旅程详情里主动点「一键计算 AA」。 */
  const [showExpenses, setShowExpenses] = useState(false)
  const [draftExpenses, setDraftExpenses] = useState<DraftExpense[]>([])
  const [expAmount, setExpAmount] = useState('')
  const [expNote, setExpNote] = useState('')
  const [expPayer, setExpPayer] = useState('我')
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('OTHER')

  /** 付款人候选：我 + 同行者（去重，「我」永远排第一） */
  const payerOptions = useMemo(() => {
    const names = draft.companions.map((c) => String(c?.name || '').trim()).filter(Boolean)
    return Array.from(new Set(['我', ...names]))
  }, [draft.companions])

  const draftExpenseTotal = draftExpenses.reduce((sum, e) => sum + e.amount, 0)

  const addDraftExpense = () => {
    const value = Number(expAmount.replace(/[^\d.]/g, ''))
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('请输入有效金额')
      return
    }
    setDraftExpenses((prev) => [
      ...prev,
      {
        // crypto.randomUUID 在部分旧 WebView 缺失，这里用时间戳 + 随机数兜底
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        amount: Math.round(value * 100) / 100,
        note: expNote.trim().slice(0, 200),
        payer: expPayer.trim() || '我',
        category: expCategory,
      },
    ])
    setExpAmount('')
    setExpNote('')
  }

  const removeDraftExpense = (id: string) => {
    setDraftExpenses((prev) => prev.filter((e) => e.id !== id))
  }

  /**
   * 创建成功后补写花销。
   * 离线本地保存（没有云端 id）时无法关联旅行，交给详情页「花销」补记，
   * 绝不假装已保存。
   */
  const flushDraftExpenses = async (travelId: number) => {
    let failed = 0
    for (const e of draftExpenses) {
      try {
        const res = await fetch(apiUrl(`/api/travels/${travelId}/expenses`), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: e.amount,
            category: e.category,
            note: e.note || undefined,
            payer: e.payer,
            happenedAt: draft.startDate ? new Date(`${draft.startDate}T12:00:00`).toISOString() : undefined,
          }),
        })
        if (!res.ok) failed += 1
      } catch {
        failed += 1
      }
    }
    return failed
  }

  useEffect(() => {
    let lastY = window.scrollY
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const y = window.scrollY
        const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
        const delta = y - lastY
        if (y <= 8) setCtaHidden(false)
        // 到底部时反而要出现：这里就是提交位置，藏起来会导致「填完了点不到」
        else if (maxY - y <= 12) setCtaHidden(false)
        else if (Math.abs(delta) >= 6) setCtaHidden(delta > 0)
        lastY = y
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  /**
   * 可在其中创建内容的共享空间（OWNER/MEMBER）。
   * 只读（VIEWER）空间不列出来：点了也会被服务端 403，不如一开始就不给。
   */
  const [mySpaces, setMySpaces] = useState<Array<{ id: number; name: string; myRole: string }>>([])
  const [spacesLoading, setSpacesLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setSpacesLoading(true)
    fetch(apiUrl('/api/spaces'), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return
        const list = (j.spaces || []) as Array<{ id: number; name: string; myRole?: string }>
        setMySpaces(
          list
            .filter((s) => s.myRole === 'OWNER' || s.myRole === 'MEMBER')
            .map((s) => ({ id: s.id, name: s.name, myRole: String(s.myRole) })),
        )
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setSpacesLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const locationRef = useRef<HTMLDivElement>(null)
  const locInputRef = useRef<HTMLInputElement>(null)
  /** 用户是否亲手改过旅行类型：改过就不再被偏好问卷的默认值覆盖 */
  const typeTouchedRef = useRef(false)

  /**
   * 用偏好问卷里的「同行者风格」预选旅行类型。
   * 走 patchSystem（不算"用户改过"），并且只在用户还没动过类型时生效 ——
   * 否则会把他刚点的选择覆盖回去。
   */
  useEffect(() => {
    let alive = true
    fetch(apiUrl('/api/me'), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return
        // /api/me 返回 { success, data }
        const profile = j?.data ?? j
        const style = profile?.preferences?.companionStyle
        if (typeof style === 'string' && style && !typeTouchedRef.current) {
          patchSystem({ travelType: style })
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [patchSystem])

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
  /** 同行者角色构成（朋友 2 · 家人 1）——聚会/团建这类多角色出行一眼看清 */
  const roleMix = roleMixOf(draft.companions)

  /** 顶栏那一句极短副标题：只报当前进度（目的地 / 天数），不写说明文案 */
  const headerSub =
    [draft.location.trim(), rangeInfo.days ? rangeInfo.days + '天' + rangeInfo.nights + '晚' : '']
      .filter(Boolean)
      .join(' · ') || '三步就出发'

  const handleSubmit = async () => {
    const r = await submit()
    if (!r.ok) return
    if (draftExpenses.length > 0) {
      if (r.remoteId) {
        const failed = await flushDraftExpenses(r.remoteId)
        if (failed > 0) {
          toast.info(`${failed} 笔花销没存上，可进入旅程后在「花销」补记`)
        } else {
          toast.success(`已记下 ${draftExpenses.length} 笔花销`)
        }
      } else {
        toast.info('花销需要在进入旅程后补记（当前是离线保存）')
      }
    }
    setSucceeded(true)
    // 让「已创建」可见一瞬，再交给调用方决定去哪（不直接跳，否则用户看不到确认）
    window.setTimeout(() => onCreated?.({ slug: r.slug, local: r.local }), 550)
  }

  return (
    <div className="tn-page">
      {/* ── 悬浮玻璃返回栏：滚动时仍是这块玻璃，不会突然变成一条白条 ── */}
      <header className="tn-topbar-wrap">
        <div className="tn-topbar lg-card">
          <button
            type="button"
            onClick={onBack}
            aria-label="返回"
            className="tn-back lg-chip"
          >
            <Icon icon={ArrowLeft} size="sm" />
          </button>
          <div className="tn-topbar-copy">
            <h1 className="tn-topbar-title">新建旅行</h1>
            <p className="tn-topbar-sub">{headerSub}</p>
          </div>
        </div>
      </header>

      <div className="tn-main">
        <form
          onSubmit={(e) => { e.preventDefault(); void handleSubmit() }}
          className="tn-form"
        >
          {/* ── ① 去哪座城市 ─────────────────────────────── */}
          <section ref={locationRef} className="tn-card lg-card--float lg-card">
            <label htmlFor="travel-location" className="tn-eyebrow">
              <Icon icon={MapPin} size="sm" tone="accent" />
              去哪？
            </label>
            <div className="tn-field">
              <span className="tn-field-icon"><Icon icon={MapPin} size="sm" /></span>
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
                className="tn-input"
              />
              {draft.location && (
                <button
                  type="button"
                  onClick={() => { patch({ location: '' }); locInputRef.current?.focus() }}
                  aria-label="清空目的地"
                  className="tn-field-clear"
                >
                  <Icon icon={X} size="sm" />
                </button>
              )}
            </div>

            {/* 联想：用既有城市库（与画册 findCityByName 同一份数据） */}
            {locSuggestions.length > 0 && (
              <ul className="tn-suggest">
                {locSuggestions.map((s) => (
                  <li key={s.value} className="tn-suggest-item">
                    <button
                      type="button"
                      onClick={() => { patch({ location: s.value }); setLocFocus(false) }}
                      className="tn-suggest-btn"
                    >
                      <span>{s.label}</span>
                      <span className="tn-suggest-en">{s.nameEn}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── ② 什么时候去 ─────────────────────────────── */}
          <section className="tn-card lg-card--float lg-card">
            <span className="tn-eyebrow">
              <Icon icon={CalendarDays} size="sm" tone="accent" />
              什么时候去
            </span>
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="tn-field tn-field--tap"
            >
              <span className="tn-field-icon"><Icon icon={CalendarDays} size="sm" /></span>
              <span className="tn-date-copy">
                {compactRange ? (
                  <>
                    <span className="tn-date-value">{compactRange}</span>
                    <span className="tn-date-sub">
                      {rangeInfo.days != null ? '共 ' + rangeInfo.days + ' 天 ' + rangeInfo.nights + ' 晚' : ''}
                      {subtitle ? ' · ' + subtitle : ''}
                    </span>
                  </>
                ) : (
                  <span className="tn-date-empty">选择开始与结束日期</span>
                )}
              </span>
              <Icon icon={ChevronDown} size="sm" className="tn-date-chev" />
            </button>
            {validation.dateError && (
              <p role="alert" className="tn-note tn-note--danger">{validation.dateError}</p>
            )}
          </section>

          {/* ── ③ 旅行名字（必填，但由前两项自动长出来） ──────── */}
          <section className="tn-card lg-card--float lg-card">
            <label htmlFor="travel-title" className="tn-eyebrow">
              <Icon icon={Sparkles} size="sm" tone="accent" />
              给这段旅程起个名字
            </label>
            <div className="tn-field">
              <input
                id="travel-title"
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="例如 新疆 6 日"
                maxLength={60}
                enterKeyHint="done"
                className="tn-input"
              />
            </div>
            {suggestions.length > 1 && (
              <div className="tn-chips">
                {suggestions.slice(1).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => patch({ title: s })}
                    className="tn-chip"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── ④ 旅途花销（可选）：只记原始账，分摊留给详情页的「一键计算 AA」 ── */}
          <section className="tn-card lg-card--float tn-card--panel lg-card">
            <button
              type="button"
              onClick={() => setShowExpenses((v) => !v)}
              aria-expanded={showExpenses}
              className="tn-panel-head"
            >
              <span className="tn-panel-title">旅途花销</span>
              <span className="tn-opt">可选</span>
              <span className="tn-panel-tail">
                {!showExpenses && draftExpenses.length > 0 && (
                  <span className="tn-panel-summary">
                    ¥{draftExpenseTotal.toFixed(2)} · {draftExpenses.length} 笔
                  </span>
                )}
                <span className={showExpenses ? 'tn-panel-chev tn-panel-chev--open' : 'tn-panel-chev'}>
                  <Icon icon={ChevronDown} size="sm" />
                </span>
              </span>
            </button>

            {showExpenses && (
              <div className="tn-panel-body">
                {/* 分类：横向滚动，一屏放不下也不挤压 */}
                <div className="tn-cat-row">
                  {EXPENSE_CATEGORIES.map((c) => {
                    const active = expCategory === c
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setExpCategory(c)}
                        aria-pressed={active}
                        className={active ? 'tn-chip tn-chip--sm tn-chip--active' : 'tn-chip tn-chip--sm'}
                      >
                        {EXPENSE_LABELS[c]}
                      </button>
                    )
                  })}
                </div>

                {/* 金额 + 备注 */}
                <div className="tn-row">
                  <div className="tn-field tn-field--amount">
                    <span className="tn-currency">¥</span>
                    <input
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                      enterKeyHint="done"
                      className="tn-input tn-input--num"
                    />
                  </div>
                  <div className="tn-field tn-field--grow">
                    <input
                      value={expNote}
                      onChange={(e) => setExpNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return
                        e.preventDefault()
                        addDraftExpense()
                      }}
                      placeholder="备注，例如 环湖包车"
                      maxLength={200}
                      enterKeyHint="done"
                      className="tn-input"
                    />
                  </div>
                </div>

                {/* 付款人：我 + 同行者快选 */}
                <div className="tn-inline">
                  <span className="tn-inline-label">谁付的</span>
                  {payerOptions.map((name) => {
                    const active = expPayer === name
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setExpPayer(name)}
                        aria-pressed={active}
                        className={active ? 'tn-pill tn-pill--on' : 'tn-pill'}
                      >
                        {name}
                      </button>
                    )
                  })}
                </div>

                <button
                  type="button"
                  onClick={addDraftExpense}
                  disabled={!expAmount.trim()}
                  className="tn-add"
                >
                  <Icon icon={Plus} size="sm" />
                  记下这一笔
                </button>

                {draftExpenses.length > 0 && (
                  <>
                    <ul className="tn-exp-list">
                      {draftExpenses.map((e) => (
                        <li key={e.id} className="tn-exp-item">
                          <span className="tn-exp-cat">{EXPENSE_LABELS[e.category]}</span>
                          <span className="tn-exp-note">{e.note || EXPENSE_LABELS[e.category]}</span>
                          <span className="tn-exp-payer">{e.payer}</span>
                          <span className="tn-exp-amt">¥{e.amount.toFixed(2)}</span>
                          <button
                            type="button"
                            onClick={() => removeDraftExpense(e.id)}
                            aria-label="删除这笔花销"
                            className="tn-exp-del"
                          >
                            <Icon icon={X} size="sm" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="tn-total">
                      共 {draftExpenses.length} 笔 · 合计{' '}
                      <span className="tn-total-num">¥{draftExpenseTotal.toFixed(2)}</span>
                    </p>
                  </>
                )}
              </div>
            )}
          </section>

          {/* ── ⑤ 更多信息（可选，默认收起） ─────────────────── */}
          <section className="tn-card lg-card--float tn-card--panel lg-card">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              aria-expanded={showMore}
              className="tn-panel-head"
            >
              <span className="tn-panel-title">更多信息</span>
              <span className="tn-opt">可选</span>
              <span className="tn-panel-tail">
                {!showMore && moreSummary && (
                  <span className="tn-panel-summary">{moreSummary}</span>
                )}
                <span className={showMore ? 'tn-panel-chev tn-panel-chev--open' : 'tn-panel-chev'}>
                  <Icon icon={ChevronDown} size="sm" />
                </span>
              </span>
            </button>

            {showMore && (
              <div className="tn-panel-body">
                {/* 类型：2 列网格 + 图标语义 */}
                <div>
                  <p className="tn-group-title">这次旅行是？</p>
                  <div className="tn-grid-2">
                    {TRAVEL_TYPE_OPTIONS.map((t) => {
                      const active = draft.travelType === t.value
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => {
                            typeTouchedRef.current = true
                            patch({ travelType: t.value })
                          }}
                          aria-pressed={active}
                          className={active ? 'tn-choice tn-choice--active' : 'tn-choice'}
                        >
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 同行者：单输入框 + 行内追加 + 常用关系快捷 */}
                <div>
                  <p className="tn-group-title">
                    和谁一起去的？
                    <span className="tn-group-hint">最多 {MAX_COMPANIONS} 人</span>
                  </p>
                  <div className="tn-row tn-mt">
                    <div className="tn-field tn-field--grow">
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
                        className="tn-input"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => { addCompanion(companionName, companionRelation); setCompanionName('') }}
                      disabled={!companionName.trim() || atCompanionLimit}
                      className="tn-addbtn"
                      aria-label="添加同行者"
                    >
                      <Icon icon={Plus} size="sm" />
                    </button>
                  </div>

                  {/* 常用关系：一键套用，省掉每个人都要现打关系 */}
                  <div className="tn-chips tn-mt">
                    {COMMON_RELATIONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCompanionRelation(companionRelation === r ? '' : r)}
                        aria-pressed={companionRelation === r}
                        className={companionRelation === r ? 'tn-chip tn-chip--sm tn-chip--active' : 'tn-chip tn-chip--sm'}
                      >
                        {r}
                      </button>
                    ))}
                  </div>

                  {draft.companions.length > 0 && (
                    <>
                      {/*
                        角色构成一目了然：聚会 / 团建这类**多角色混合**出行，
                        光看"5 位同行"不知道都是谁，这里按关系汇总。
                      */}
                      {roleMix.length > 0 && (
                        <p className="tn-role tn-mt">
                          {roleMix.map((r) => r.relation + ' ' + r.count).join(' · ')}
                          {roleMix.length > 1 && (
                            <span className="tn-role-more">（多角色同行）</span>
                          )}
                        </p>
                      )}
                      <div className="tn-chips tn-mt">
                        {draft.companions.map((c, i) => (
                          <span key={c.name + '-' + i} className="tn-chip tn-chip--ent m-enter">
                            <span className="tn-trunc">{c.name}</span>
                            {c.relation ? <span className="tn-group-hint">· {c.relation}</span> : null}
                            <button
                              type="button"
                              onClick={() => removeCompanion(i)}
                              aria-label={'移除 ' + c.name}
                              className="tn-chip-x"
                            >
                              <Icon icon={X} size="sm" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* 描述 */}
                <div>
                  <label htmlFor="travel-desc" className="tn-group-title">一句话描述</label>
                  <div className="tn-field tn-field--area tn-mt">
                    <textarea
                      id="travel-desc"
                      value={draft.description}
                      onChange={(e) => patch({ description: e.target.value })}
                      rows={3}
                      placeholder="想记住的理由（可选）"
                      className="tn-input tn-input--area"
                    />
                  </div>
                </div>

                {/* 可见性与归属：三档 + 空间选择。
                    原先只有「仅自己 / 公开」两个选项、且只写 isPublic —— 而 visibility
                    一直吃 schema 默认的 SPACE，用户勾「仅自己」实际是"空间成员可见"。 */}
                <div>
                  <p className="tn-group-title">谁能看到</p>
                  <div className="tn-row-3">
                    {[
                      { v: 'PRIVATE' as const, label: '仅自己', hint: '默认' },
                      { v: 'SPACE' as const, label: '空间可见', hint: '空间成员' },
                      { v: 'PUBLIC' as const, label: '公开', hint: '所有人' },
                    ].map((o) => {
                      const active = draft.visibility === o.v
                      return (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => patch({ visibility: o.v })}
                          aria-pressed={active}
                          className={active ? 'tn-choice tn-choice--col tn-choice--active' : 'tn-choice tn-choice--col'}
                        >
                          <span>{o.label}</span>
                          <span className="tn-choice-hint">{o.hint}</span>
                        </button>
                      )
                    })}
                  </div>

                  {/* 一键加入某个空间（可选）：建好就在空间里，成员直接能看能改 */}
                  <div className="tn-chips tn-mt">
                    <button
                      type="button"
                      onClick={() => patch({ spaceId: null })}
                      aria-pressed={draft.spaceId === null}
                      className={draft.spaceId === null ? 'tn-chip tn-chip--sm tn-chip--active' : 'tn-chip tn-chip--sm'}
                    >
                      不放进空间
                    </button>
                    {mySpaces.map((s) => {
                      const active = draft.spaceId === s.id
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => patch({ spaceId: s.id, visibility: 'SPACE' })}
                          aria-pressed={active}
                          className={active ? 'tn-chip tn-chip--sm tn-chip--active' : 'tn-chip tn-chip--sm'}
                        >
                          <span className="tn-trunc">{s.name}</span>
                        </button>
                      )
                    })}
                    {mySpaces.length === 0 && !spacesLoading && (
                      <span className="tn-group-hint">还没有共享空间</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {error && (
            <p role="alert" className="tn-form-error">{error}</p>
          )}

          {/* ── 主 CTA：悬浮玻璃条 + 玻璃主按钮 ─────────────────
                位置 = 底部 Tab 高度 + 系统安全区 +（软键盘弹起时的占用高度）+ 让开中央 FAB */}
          <div
            className={ctaHidden ? 'tn-cta tn-cta--hidden' : 'tn-cta'}
            style={{
              bottom: 'calc(var(--m-tab-h) + env(safe-area-inset-bottom) + ' + keyboardInset + 'px + 20px)',
            }}
          >
            <div className="tn-cta-dock">
              {!validation.canSubmit && validation.blocker && (
                <p className="tn-cta-blocker">{validation.blocker}</p>
              )}
              <Button
                type="submit"
                block
                size="lg"
                className="lg-action tn-cta-btn"
                icon={succeeded ? Check : undefined}
                loading={submitting}
                disabled={succeeded || !validation.canSubmit}
              >
                {succeeded ? '已创建' : submitting ? '正在创建…' : '开始记录'}
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* 保持挂载（用 open 控制）：BottomSheet 的退场弹簧动画需要组件在场 */}
      <DateRangePicker
        open={showPicker}
        startDate={draft.startDate}
        endDate={draft.endDate}
        onChange={({ startDate, endDate }) => patch({ startDate, endDate })}
        onClose={() => setShowPicker(false)}
      />
    </div>
  )
}
