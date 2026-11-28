'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { ArrowLeft, CalendarDays, Check, ChevronDown, MapPin, Plus, Sparkles, X } from '@/lib/mobile/icon-system'
import { Button } from '@/components/mobile/Button'
import { Icon } from '@/components/mobile/Icon'
import { cn } from '@/lib/utils'
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
 * 行内 ＋ 追加 / 折叠更多 / 建完进详情），视觉仍用甜途自己的 --m-* 暖色 token。
 *
 * 三条关键信息层级：
 *   去哪 → 什么时候 → 给这段旅程起个名字（必填只有第三项，且由前两项自动长出来）
 *   其余全部收进「更多（可选）」。
 *
 * ── 体验精修（1.30.18）────────────────────────────────────────────────────
 * 这一轮只做「动效 / 页面切换 / 微交互」，不改业务逻辑与数据结构：
 *
 *   ① 进场节奏：顶栏落下 → 五张卡错峰上浮（stagger 60ms / rise 12px / 360ms），
 *      退场反向错峰轻淡出（180ms）。全走 motion，尊重 prefers-reduced-motion；
 *   ② 折叠区：CSS grid-template-rows 0fr→1fr（零 JS 逐帧 layout），展开后自动滚到
 *      可见、收起后焦点回到标题按钮；收起内容 inert，键盘/读屏不会落进不可见区域；
 *   ③ 字段反馈：聚焦细环、校验失败轻抖（shake）、错误文案淡入、城市联想
 *      combobox（↑↓ / Enter / Esc 键盘可选）、选中后一次性光环；
 *   ④ 主 CTA：可用（呼吸光晕）/ 禁用（灰玻璃 + 点一下抖出缺的字段）/
 *      提交中（不定进度条）→ 成功遮罩（勾弹出）→ 页面淡出进详情；
 *   ⑤ 键盘与安全区：键盘高度用 transform 抬升（不逐帧改 bottom），页面底部预留
 *      同高让位，聚焦时字段滚到 CTA 之上；
 *   ⑥ 无障碍：错误 aria-live、联想 aria-activedescendant、折叠 aria-expanded +
 *      aria-controls、减动效全量降级。
 */

/** 创建前暂存的一笔花销（只在前端草稿里，创建成功后才落库） */
type DraftExpense = {
  id: string
  amount: number
  note: string
  payer: string
  category: ExpenseCategory
}

/** 缓动：与 app/motion-tokens.css 的 --motion-ease-* 完全一致 */
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]
const EASE_IN: [number, number, number, number] = [0.4, 0, 1, 1]
/** 错峰间隔：对应 --motion-stagger 60ms */
const STAGGER = 0.06
/** 上浮位移：对应 --motion-rise 12px */
const RISE = 12

/** 卡片列表的进场/退场编排（reduced-motion 时退化为无位移、瞬时淡入淡出） */
function buildMotion(reduce: boolean): { list: Variants; item: Variants } {
  return {
    list: {
      hidden: {},
      visible: {
        transition: { staggerChildren: reduce ? 0 : STAGGER, delayChildren: reduce ? 0 : 0.05 },
      },
      out: {
        transition: { staggerChildren: reduce ? 0 : 0.03, staggerDirection: -1 as const },
      },
    },
    item: {
      hidden: { opacity: 0, y: reduce ? 0 : RISE, scale: reduce ? 1 : 0.992 },
      visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: reduce ? 0 : 0.36, ease: EASE_OUT },
      },
      out: {
        opacity: 0,
        y: reduce ? 0 : -8,
        scale: reduce ? 1 : 0.996,
        transition: { duration: reduce ? 0 : 0.18, ease: EASE_IN },
      },
    },
  }
}

/** 折叠区 id：aria-controls 与 inert 的落点 */
const EXP_BODY_ID = 'tn-expense-body'
const MORE_BODY_ID = 'tn-more-body'
const EXP_HEAD_ID = 'tn-expense-head'
const MORE_HEAD_ID = 'tn-more-head'
const LOC_LIST_ID = 'tn-location-list'
const locOptionId = (index: number) => 'tn-location-option-' + index

type ShakeTarget = 'title' | 'date' | 'location' | null

export default function TravelComposerForm({
  onBack,
  onCreated,
  leaving = false,
}: {
  onBack: () => void
  /**
   * 创建成功回调。slug 为云端 slug（离线本地保存时为 null）。
   * 由调用方决定落地页：有 slug → 进 /travel/<slug>；否则回列表。
   */
  onCreated?: (info: { slug: string | null; local: boolean }) => void
  /** 页面正在退场（淡出）：此时卡片反向错峰淡出，等动画播完再由调用方跳转 */
  leaving?: boolean
}) {
  const {
    draft, patch, patchSystem, suggestions, submitting, error,
    validation, addCompanion, removeCompanion, submit,
  } = useTravelDraft(true)

  const reduce = useReducedMotion() === true
  const motionSet = useMemo(() => buildMotion(reduce), [reduce])

  const [showPicker, setShowPicker] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [locFocus, setLocFocus] = useState(false)
  /** 联想里键盘高亮的那一项（↑↓ 移动，Enter 选中） */
  const [locActive, setLocActive] = useState(0)
  /** 刚选中城市/日期时的一次性光环（640ms 后自动回收，不进入持久状态） */
  const [locPicked, setLocPicked] = useState(false)
  const [datePicked, setDatePicked] = useState(false)
  /** 校验失败时抖一下哪个字段（null = 不抖） */
  const [shakeTarget, setShakeTarget] = useState<ShakeTarget>(null)
  const [companionName, setCompanionName] = useState('')
  const [companionRelation, setCompanionRelation] = useState('')
  const [succeeded, setSucceeded] = useState(false)
  // 粘底保存条在移动 Web 下要自己避让键盘（原生壳里 insets 会压视口，值≈0 不干扰）
  const keyboardInset = useKeyboardInset()
  /**
   * 2026-11-28 起本页是沉浸式：底部主导航隐藏，主 CTA 条**就是**这一页的底部栏。
   * 因此它不再随滚动收起（旧版是"浮在 Tab 栏之上"才允许收起）——收起会让页面底部
   * 看起来空掉一块，且填完表单当场点不到。这里保留常量 false，仅用于类名兼容。
   */
  const ctaHidden = false
  /** 滚动后顶栏加一层实底：玻璃太透时，下面滚过的文字会"穿"上来 */
  const [scrolled, setScrolled] = useState(false)

  /* ── 旅途花销 ▌创建前就能先记原始账 ────────────────────────────────
     只存本地草稿；CU 建完行程、拿到云端 id 后再逐笔 POST。
     分摊（AA）不在这里算 —— 用户必须在旅程详情里主动点「一键计算 AA」。 */
  const [showExpenses, setShowExpenses] = useState(false)
  const [draftExpenses, setDraftExpenses] = useState<DraftExpense[]>([])
  /** 最新一笔的 id：列表里高亮 760ms，让"刚记下的那笔"能被一眼找到 */
  const [newExpenseId, setNewExpenseId] = useState<string | null>(null)
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
    // crypto.randomUUID 在部分旧 WebView 缺失，这里用时间戳 + 随机数兜底
    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
    setDraftExpenses((prev) => [
      ...prev,
      {
        id,
        amount: Math.round(value * 100) / 100,
        note: expNote.trim().slice(0, 200),
        payer: expPayer.trim() || '我',
        category: expCategory,
      },
    ])
    setNewExpenseId(id)
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
        const res = await fetch(apiUrl('/api/travels/' + travelId + '/expenses'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: e.amount,
            category: e.category,
            note: e.note || undefined,
            payer: e.payer,
            happenedAt: draft.startDate ? new Date(draft.startDate + 'T12:00:00').toISOString() : undefined,
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
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const y = window.scrollY
        setScrolled(y > 10)
        // 沉浸式下 CTA 常驻（见 ctaHidden 注释），这里只跟踪"是否滚过顶部"
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
  const titleInputRef = useRef<HTMLInputElement>(null)
  const dateBtnRef = useRef<HTMLButtonElement>(null)
  /** 折叠区：面板体（滚动目标）与标题按钮（收起后焦点落回这里） */
  const expBodyRef = useRef<HTMLDivElement>(null)
  const expHeadRef = useRef<HTMLButtonElement>(null)
  const moreBodyRef = useRef<HTMLDivElement>(null)
  const moreHeadRef = useRef<HTMLButtonElement>(null)
  /** 用户是否亲手改过旅行类型：改过就不再被偏好问卷的默认值覆盖 */
  const typeTouchedRef = useRef(false)
  /** 打字聚焦时用于"把字段滚到 CTA 之上"的定时器 */
  const focusScrollTimer = useRef<number | null>(null)

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
  // 入场动画（360ms）播完再聚焦，避免键盘弹起与上浮动画抢同一帧
  useEffect(() => {
    const t = window.setTimeout(() => locInputRef.current?.focus({ preventScroll: true }), reduce ? 60 : 420)
    return () => window.clearTimeout(t)
  }, [reduce])

  const locSuggestions = useMemo(
    () => (locFocus ? suggestLocations(draft.location) : []),
    [locFocus, draft.location],
  )

  // 查询变了，键盘高亮回到第一项
  useEffect(() => {
    setLocActive(0)
  }, [draft.location])

  // 一次性光环 / 高亮自动回收
  useEffect(() => {
    if (!locPicked) return
    const t = window.setTimeout(() => setLocPicked(false), 640)
    return () => window.clearTimeout(t)
  }, [locPicked])
  useEffect(() => {
    if (!datePicked) return
    const t = window.setTimeout(() => setDatePicked(false), 640)
    return () => window.clearTimeout(t)
  }, [datePicked])
  useEffect(() => {
    if (!newExpenseId) return
    const t = window.setTimeout(() => setNewExpenseId(null), 760)
    return () => window.clearTimeout(t)
  }, [newExpenseId])
  useEffect(() => {
    if (!shakeTarget) return
    const t = window.setTimeout(() => setShakeTarget(null), 560)
    return () => window.clearTimeout(t)
  }, [shakeTarget])

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

  const selectLocation = (value: string) => {
    patch({ location: value })
    setLocFocus(false)
    setLocPicked(true)
  }

  /**
   * 折叠面板开关：展开后滚到可见、收起后焦点回到标题按钮。
   * 面板体用 grid-template-rows 过渡（CSS），这里只负责"动画结束后"的滚动与焦点。
   */
  const toggleFold = (key: 'expenses' | 'more') => {
    const open = key === 'expenses' ? showExpenses : showMore
    const bodyRef = key === 'expenses' ? expBodyRef : moreBodyRef
    const headRef = key === 'expenses' ? expHeadRef : moreHeadRef
    // 收起前：如果焦点在面板里，先收回标题按钮（否则焦点会留在被裁掉的区域）
    if (open && bodyRef.current?.contains(document.activeElement)) {
      headRef.current?.focus({ preventScroll: true })
    }
    if (key === 'expenses') setShowExpenses((v) => !v)
    else setShowMore((v) => !v)

    if (open) return
    // 展开：等高度过渡走完再滚，避免滚到"还没长高"的位置
    const el = bodyRef.current
    if (!el) return
    window.setTimeout(() => {
      const rect = el.getBoundingClientRect()
      const topbarH = 88
      const ctaReserve = 176 + (keyboardInset > 0 ? keyboardInset : 0)
      // 已经完整可见（在多出来的区域里）就不动滚动位置，免得"点一下页面跳一下"
      if (rect.top >= topbarH && rect.bottom <= window.innerHeight - ctaReserve) return
      // 对齐到顶栏下方：面板可能是屏幕高的两倍，scrollIntoView('nearest') 对超高的
      // 元素会判定"已经可见"而不动，所以自己算目标位置
      const top = Math.max(0, window.scrollY + rect.top - topbarH)
      window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' })
    }, reduce ? 30 : 240)
  }

  /**
   * 被禁用态 CTA 点了一下：抖一下缺的那个字段并把它滚到眼前。
   * 比"点了没反应"明确得多，也是本轮"字段状态反馈"的一部分。
   */
  const nudgeToBlocker = useCallback(() => {
    const target: ShakeTarget = !draft.title.trim()
      ? 'title'
      : validation.dateError
        ? 'date'
        : 'location'
    setShakeTarget(target)
    const el = target === 'title' ? titleInputRef.current : target === 'date' ? dateBtnRef.current : locInputRef.current
    el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    if (target === 'title') titleInputRef.current?.focus({ preventScroll: true })
  }, [draft.title, validation.dateError, reduce])

  /** 输入聚焦时把字段滚到 CTA 之上（移动端键盘弹起后 CTA 会抬到键盘上方） */
  const handleFocusIn = (e: React.FocusEvent<HTMLFormElement>) => {
    const target = e.target as HTMLElement
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return
    if (typeof window.matchMedia === 'function' && !window.matchMedia('(pointer: coarse)').matches) return
    if (focusScrollTimer.current) window.clearTimeout(focusScrollTimer.current)
    focusScrollTimer.current = window.setTimeout(() => {
      const rect = target.getBoundingClientRect()
      const safeBottom = window.innerHeight - 172
      if (rect.bottom <= safeBottom) return
      target.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    }, 280)
  }

  const handleSubmit = async () => {
    if (submitting || succeeded) return
    if (!validation.canSubmit) {
      nudgeToBlocker()
      return
    }
    const r = await submit()
    if (!r.ok) return
    if (draftExpenses.length > 0) {
      if (r.remoteId) {
        const failed = await flushDraftExpenses(r.remoteId)
        if (failed > 0) {
          toast.info(failed + ' 笔花销没存上，可进入旅程后在「花销」补记')
        } else {
          toast.success('已记下 ' + draftExpenses.length + ' 笔花销')
        }
      } else {
        toast.info('花销需要在进入旅程后补记（当前是离线保存）')
      }
    }
    setSucceeded(true)
    // 让「已创建」可见一瞬，再交给调用方决定去哪（不直接跳，否则用户看不到确认）
    window.setTimeout(() => onCreated?.({ slug: r.slug, local: r.local }), 620)
  }

  const canSubmit = validation.canSubmit && !succeeded

  return (
    <div
      className="tn-page"
      style={{ '--tn-kb': keyboardInset + 'px' } as CSSProperties}
    >
      {/* ── 悬浮玻璃返回栏：滚动时仍是这块玻璃，不会突然变成一条白条 ── */}
      <header className="tn-topbar-wrap">
        <div className={cn('tn-topbar lg-card', scrolled && 'tn-topbar--solid')}>
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
        {/*
          表单即编排容器：初始 hidden → visible 时子项按 stagger 60ms 依次上浮；
          leaving 时切到 out，子项反向错峰淡出（页面切换的"离场"半程）。
        */}
        <motion.form
          onSubmit={(e) => { e.preventDefault(); void handleSubmit() }}
          onFocus={(e) => handleFocusIn(e)}
          className="tn-form"
          variants={motionSet.list}
          initial="hidden"
          animate={leaving ? 'out' : 'visible'}
        >
          {/* ── ① 去哪座城市 ─────────────────────────────── */}
          <motion.div className="tn-rise" variants={motionSet.item}>
            <section ref={locationRef} className="tn-card lg-card--float lg-card">
              <label htmlFor="travel-location" className="tn-eyebrow">
                <Icon icon={MapPin} size="sm" tone="accent" />
                去哪？
              </label>
              <div
                className={cn(
                  'tn-field',
                  shakeTarget === 'location' && 'tn-shake',
                  locPicked && 'tn-field--picked',
                )}
              >
                <span className="tn-field-icon"><Icon icon={MapPin} size="sm" /></span>
                <input
                  id="travel-location"
                  ref={locInputRef}
                  value={draft.location}
                  onChange={(e) => patch({ location: e.target.value })}
                  onFocus={() => setLocFocus(true)}
                  onKeyDown={(e) => {
                    const hasList = locSuggestions.length > 0
                    if (e.key === 'ArrowDown' && hasList) {
                      e.preventDefault()
                      setLocActive((i) => Math.min(i + 1, locSuggestions.length - 1))
                      return
                    }
                    if (e.key === 'ArrowUp' && hasList) {
                      e.preventDefault()
                      setLocActive((i) => Math.max(i - 1, 0))
                      return
                    }
                    if (e.key === 'Enter') {
                      // Enter 在目的地里不提交表单：有联想就选中，没有就去下一个字段
                      e.preventDefault()
                      if (hasList) selectLocation(locSuggestions[Math.min(locActive, locSuggestions.length - 1)].value)
                      else titleInputRef.current?.focus()
                      return
                    }
                    if (e.key === 'Escape' && hasList) {
                      e.preventDefault()
                      setLocFocus(false)
                    }
                  }}
                  role="combobox"
                  aria-expanded={locSuggestions.length > 0}
                  aria-controls={LOC_LIST_ID}
                  aria-autocomplete="list"
                  aria-activedescendant={
                    locSuggestions.length > 0 ? locOptionId(Math.min(locActive, locSuggestions.length - 1)) : undefined
                  }
                  placeholder="城市或地区，例如 乌鲁木齐"
                  maxLength={120}
                  autoComplete="off"
                  enterKeyHint="next"
                  className="tn-input"
                />
                {locPicked && <span className="tn-field-pickfx" aria-hidden="true" />}
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
              <AnimatePresence initial={false}>
                {locSuggestions.length > 0 && (
                  <motion.ul
                    id={LOC_LIST_ID}
                    role="listbox"
                    aria-label="目的地联想"
                    className="tn-suggest"
                    initial={{ opacity: 0, y: reduce ? 0 : -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: reduce ? 0 : -4 }}
                    transition={{ duration: reduce ? 0 : 0.18, ease: EASE_OUT }}
                  >
                    {locSuggestions.map((s, i) => {
                      const active = i === Math.min(locActive, locSuggestions.length - 1)
                      return (
                        <li key={s.value} className="tn-suggest-item">
                          <div
                            id={locOptionId(i)}
                            role="option"
                            aria-selected={active}
                            data-active={active || undefined}
                            onMouseDown={(e) => {
                              // mousedown + preventDefault：输入框不失焦，软键盘不会收起再弹起
                              e.preventDefault()
                              selectLocation(s.value)
                            }}
                            onMouseEnter={() => setLocActive(i)}
                            className="tn-suggest-btn"
                          >
                            <span>{s.label}</span>
                            <span className="tn-suggest-en">{s.nameEn}</span>
                          </div>
                        </li>
                      )
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>
            </section>
          </motion.div>

          {/* ── ② 什么时候去 ─────────────────────────────── */}
          <motion.div className="tn-rise" variants={motionSet.item}>
            <section className="tn-card lg-card--float lg-card">
              <span className="tn-eyebrow">
                <Icon icon={CalendarDays} size="sm" tone="accent" />
                什么时候去
              </span>
              <button
                type="button"
                ref={dateBtnRef}
                onClick={() => setShowPicker(true)}
                aria-haspopup="dialog"
                aria-expanded={showPicker}
                className={cn('tn-field tn-field--tap', shakeTarget === 'date' && 'tn-shake', datePicked && 'tn-field--picked')}
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
                {datePicked && <span className="tn-field-pickfx" aria-hidden="true" />}
                <Icon icon={ChevronDown} size="sm" className={cn('tn-date-chev', showPicker && 'tn-date-chev--open')} />
              </button>
              <AnimatePresence initial={false}>
                {validation.dateError && (
                  <motion.p
                    key="date-error"
                    role="alert"
                    aria-live="polite"
                    className="tn-note tn-note--danger"
                    initial={{ opacity: 0, y: reduce ? 0 : -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduce ? 0 : 0.18, ease: EASE_OUT }}
                  >
                    {validation.dateError}
                  </motion.p>
                )}
              </AnimatePresence>
            </section>
          </motion.div>

          {/* ── ③ 旅行名字（必填，但由前两项自动长出来） ──────── */}
          <motion.div className="tn-rise" variants={motionSet.item}>
            <section className="tn-card lg-card--float lg-card">
              <label htmlFor="travel-title" className="tn-eyebrow">
                <Icon icon={Sparkles} size="sm" tone="accent" />
                给这段旅程起个名字
              </label>
              <div className={cn('tn-field', shakeTarget === 'title' && 'tn-shake')}>
                <input
                  id="travel-title"
                  ref={titleInputRef}
                  value={draft.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  placeholder="例如 新疆 6 日"
                  maxLength={60}
                  enterKeyHint="done"
                  aria-invalid={shakeTarget === 'title' || undefined}
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
          </motion.div>

          {/* ── ④ 旅途花销（可选）：只记原始账，分摊留给详情页的「一键计算 AA」 ── */}
          <motion.div className="tn-rise" variants={motionSet.item}>
            <section className={cn('tn-card tn-card--panel lg-card', showExpenses ? 'tn-card--hold' : 'lg-card--float')}>
              <button
                type="button"
                id={EXP_HEAD_ID}
                ref={expHeadRef}
                onClick={() => toggleFold('expenses')}
                aria-expanded={showExpenses}
                aria-controls={EXP_BODY_ID}
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

              {/* 折叠：grid-template-rows 0fr→1fr（只跑两条关键帧，零 JS 逐帧 layout） */}
              <div
                id={EXP_BODY_ID}
                ref={expBodyRef}
                className={showExpenses ? 'tn-fold tn-fold--open' : 'tn-fold'}
              >
                <div className="tn-fold-inner" inert={!showExpenses || undefined}>
                  <div className="tn-fold-body" role="group" aria-labelledby={EXP_HEAD_ID}>
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
                          aria-label="金额"
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
                          aria-label="花销备注"
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
                          <AnimatePresence initial={false}>
                            {draftExpenses.map((e) => (
                              <motion.li
                                key={e.id}
                                layout={reduce ? false : 'position'}
                                initial={{ opacity: 0, y: reduce ? 0 : -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: reduce ? 0 : 10 }}
                                transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
                                className={cn('tn-exp-item', e.id === newExpenseId && 'tn-exp-item--new')}
                              >
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
                              </motion.li>
                            ))}
                          </AnimatePresence>
                        </ul>
                        <p className="tn-total" aria-live="polite">
                          共 {draftExpenses.length} 笔 · 合计{' '}
                          <span className="tn-total-num">¥{draftExpenseTotal.toFixed(2)}</span>
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </motion.div>

          {/* ── ⑤ 更多信息（可选，默认收起） ─────────────────── */}
          <motion.div className="tn-rise" variants={motionSet.item}>
            <section className={cn('tn-card tn-card--panel lg-card', showMore ? 'tn-card--hold' : 'lg-card--float')}>
              <button
                type="button"
                id={MORE_HEAD_ID}
                ref={moreHeadRef}
                onClick={() => toggleFold('more')}
                aria-expanded={showMore}
                aria-controls={MORE_BODY_ID}
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

              <div
                id={MORE_BODY_ID}
                ref={moreBodyRef}
                className={showMore ? 'tn-fold tn-fold--open' : 'tn-fold'}
              >
                <div className="tn-fold-inner" inert={!showMore || undefined}>
                  <div className="tn-fold-body" role="group" aria-labelledby={MORE_HEAD_ID}>
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
                            aria-label="同行者姓名或称呼"
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
                </div>
              </div>
            </section>
          </motion.div>

          <AnimatePresence initial={false}>
            {error && (
              <motion.p
                key="form-error"
                role="alert"
                aria-live="assertive"
                className="tn-form-error"
                initial={{ opacity: 0, y: reduce ? 0 : -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* ── 主 CTA：悬浮玻璃条 + 玻璃主按钮 ─────────────────
                位置 = 底部 Tab 高度 + 系统安全区；软键盘用 transform 抬升（不逐帧改 bottom）
                三态：可用（呼吸光晕）/ 禁用（灰玻璃 + 点击定位）/ 提交中（不定进度条） */}
          {/* 沉浸式：CTA 条就是这一页的底部栏（Tab 栏已隐藏），贴 safe-area + 8px */}
          <div
            className={cn('tn-cta', ctaHidden && 'tn-cta--hidden')}
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
          >
            <div
              className={cn(
                'tn-cta-dock',
                canSubmit && !submitting ? 'tn-cta-dock--ready' : null,
                !validation.canSubmit && !submitting && !succeeded ? 'tn-cta-dock--blocked' : null,
                submitting ? 'tn-cta-dock--busy' : null,
              )}
            >
              {submitting && (
                <span className="tn-cta-load" aria-hidden="true">
                  <span className="tn-cta-load-bar" />
                </span>
              )}
              {!validation.canSubmit && validation.blocker && !submitting && (
                <p className="tn-cta-blocker" aria-live="polite">{validation.blocker}</p>
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
              {/* 禁用态：按钮本身不收点击事件，用一层透明的"接住"手势来抖出缺的字段 */}
              {!validation.canSubmit && !submitting && !succeeded && (
                <span className="tn-cta-tapcatch" aria-hidden="true" onPointerDown={nudgeToBlocker} />
              )}
            </div>
          </div>
        </motion.form>
      </div>

      {/* 成功遮罩：勾一弹出 → 短暂停住 → 调用方淡出整页进详情 */}
      <AnimatePresence>
        {succeeded && (
          <motion.div
            className="tn-done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
            aria-live="polite"
          >
            <div className="tn-done-dock">
              <motion.span
                className="tn-done-check"
                initial={{ scale: reduce ? 1 : 0.62, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 24, mass: 0.7 }}
              >
                <Icon icon={Check} size="lg" />
              </motion.span>
              <p className="tn-done-title">已创建</p>
              <p className="tn-done-sub">{draft.title.trim() || '正在进入这段旅程'}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 保持挂载（用 open 控制）：BottomSheet 的退场弹簧动画需要组件在场 */}
      <DateRangePicker
        open={showPicker}
        startDate={draft.startDate}
        endDate={draft.endDate}
        onChange={({ startDate, endDate }) => {
          patch({ startDate, endDate })
          setDatePicked(true)
        }}
        onClose={() => setShowPicker(false)}
      />
    </div>
  )
}
