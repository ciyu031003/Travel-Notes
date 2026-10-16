'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock, ChevronUp, ChevronDown } from 'lucide-react'
import { Icon } from './Icon'
import { hapticLight } from '@/lib/mobile/haptics'
import { cn } from '@/lib/utils'

/**
 * 时间选择器（2026-10-16 第三版）
 * ============================================================================
 * 需求：行程的「开始 / 结束」用滚轮选时间（左小时、右分钟）。
 *
 * 前两版为什么坏：
 *  ① 第一版把 onChange 绑在 onScroll 上、且每次值变化都程序化改 scrollTop，
 *     构成反馈环 → 真机卡死/闪退；
 *  ② 第二版改用防抖取值，但**用 `Math.round(scrollTop / ITEM_H)` 推算选中项**。
 *     这个推算依赖"每行高度恰好等于 ITEM_H""spacer 高度恰好是 ITEM_H 的整数倍"
 *     "scroll-snap 吸附点恰好落在 i × ITEM_H" 三个假设同时成立；
 *     真机上只要行高被字体/DPR/安全区影响几像素，或 scroll-snap 的吸附基准与假设
 *     不同，取到的索引就会**系统性偏移**（真机反馈「不管选什么都是 1 点到 5 点」）。
 *
 * 这一版的做法：**不再推算，直接测量**。
 *  · 选中项 = 各行 `offsetTop` 与容器中心距离最近的那一行（几何真值，与行高无关）；
 *  · 不再使用 scroll-snap（吸附会让"读到的位置"与"用户看到的"错位）；
 *  · 显式 `touch-action: pan-y`，保证纵向手势归本控件，不被外层抽屉抢走；
 *  · **保底输入**：每一行可直接点选，另有 ▲▼ 步进按钮 —— 即使某些机型滚动异常，
 *    用户依然能把时间设成任意值（不会再出现"怎么选都是同一个值"）。
 */

const ITEM_H = 40
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"))

/** 归一化为 HH:mm 并对齐 5 分钟档（保证滚轮里一定有这个值） */
export function normalizeTime(v: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(v || "")
  if (!m) return ""
  const h = Math.min(23, Math.max(0, Number(m[1])))
  const min = Math.min(55, Math.round(Number(m[2]) / 5) * 5)
  return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0")
}

/**
 * 单列滚轮。
 * 关键：选中项靠**测量**得出（offsetTop 与容器中心比距离），不靠 scrollTop 除行高。
 */
function Wheel({
  values,
  value,
  onChange,
  label,
}: {
  values: string[]
  value: string
  onChange: (v: string) => void
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const settleTimer = useRef<number | null>(null)
  const programmaticRef = useRef(false)
  const idx = Math.max(0, values.indexOf(value))

  /** 当前中心行的索引：按每一行的真实 offsetTop 测距，与行高解耦 */
  const measureIndex = useCallback(() => {
    const el = ref.current
    if (!el) return null
    const center = el.scrollTop + el.clientHeight / 2
    let best = 0
    let bestDist = Number.POSITIVE_INFINITY
    itemRefs.current.forEach((node, i) => {
      if (!node) return
      const c = node.offsetTop + node.offsetHeight / 2
      const d = Math.abs(c - center)
      if (d < bestDist) { bestDist = d; best = i }
    })
    return best
  }, [])

  /** 把第 i 行滚到中心 */
  const scrollToIndex = useCallback((i: number, smooth = false) => {
    const el = ref.current
    const node = itemRefs.current[i]
    if (!el || !node) return
    const target = node.offsetTop + node.offsetHeight / 2 - el.clientHeight / 2
    programmaticRef.current = true
    if (smooth && typeof el.scrollTo === "function") {
      el.scrollTo({ top: target, behavior: "smooth" })
      window.setTimeout(() => { programmaticRef.current = false }, 260)
    } else {
      el.scrollTop = target
      window.setTimeout(() => { programmaticRef.current = false }, 80)
    }
  }, [])

  // 外部值变化（含首次挂载）时对齐一次；已经对齐就不动，避免抖动
  useEffect(() => {
    const i = measureIndex()
    if (i === null) return
    if (values[i] === value) return
    scrollToIndex(idx)
    // 仅在 value/idx 变化时执行
  }, [idx, value, measureIndex, scrollToIndex, values])

  useEffect(
    () => () => { if (settleTimer.current) window.clearTimeout(settleTimer.current) },
    [],
  )

  /** 滚动停止后读取中心行（防抖 120ms），不在滚动过程中持续 setState */
  const handleScroll = () => {
    if (programmaticRef.current) return
    if (settleTimer.current) window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      const i = measureIndex()
      if (i === null) return
      const next = values[i]
      if (next && next !== value) {
        void hapticLight()
        onChange(next)
      }
    }, 120)
  }

  const step = (delta: number) => {
    const next = Math.max(0, Math.min(values.length - 1, idx + delta))
    if (next === idx) return
    void hapticLight()
    onChange(values[next])
    scrollToIndex(next, true)
  }

  return (
    <div className="relative flex-1" role="listbox" aria-label={label}>
      {/* 中央选中带：纯视觉，不拦手势 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 rounded-xl bg-[var(--m-accent-soft)] ring-1 ring-[var(--m-accent)]/25"
        style={{ height: ITEM_H }}
        aria-hidden="true"
      />
      <div
        ref={ref}
        onScroll={handleScroll}
        className="m-wheel m-wheel-mask relative"
        style={{ height: ITEM_H * 5 }}
      >
        {/* 上下留白：让首尾项也能停在中心 */}
        <div style={{ height: ITEM_H * 2 }} aria-hidden="true" />
        {values.map((v, i) => (
          <button
            key={v}
            type="button"
            ref={(node) => { itemRefs.current[i] = node }}
            role="option"
            aria-selected={v === value}
            onClick={() => { void hapticLight(); onChange(v); scrollToIndex(i, true) }}
            className={cn(
              "flex w-full items-center justify-center tabular-nums transition-colors duration-150",
              v === value
                ? "text-[18px] font-semibold text-[var(--m-accent-strong)]"
                : "text-[15px] text-[var(--m-faint)]",
            )}
            style={{ height: ITEM_H }}
          >
            {v}
          </button>
        ))}
        <div style={{ height: ITEM_H * 2 }} aria-hidden="true" />
      </div>

      {/* 步进按钮：滚动手势万一被外层抢走，用户仍能精确调整 */}
      <div className="pointer-events-none absolute inset-y-0 right-0 flex flex-col justify-between py-0.5">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={idx <= 0}
          aria-label={label + "减小"}
          className="m-pressable pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-[var(--m-surface-solid)] text-[var(--m-muted)] shadow-[var(--m-shadow-l2)] disabled:opacity-30"
        >
          <Icon icon={ChevronUp} size="sm" />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={idx >= values.length - 1}
          aria-label={label + "增大"}
          className="m-pressable pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-[var(--m-surface-solid)] text-[var(--m-muted)] shadow-[var(--m-shadow-l2)] disabled:opacity-30"
        >
          <Icon icon={ChevronDown} size="sm" />
        </button>
      </div>
    </div>
  )
}

/**
 * 时间字段：点击在下方内联展开滚轮（左小时 / 右分钟）。
 * 值在选择过程中实时回写，不需要"确定"也不会丢。
 */
export function TimeField({
  label,
  value,
  onChange,
  className,
  placeholder = "选择时间",
}: {
  label?: string
  value: string
  onChange: (next: string) => void
  className?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const normalized = normalizeTime(value)
  const hour = normalized ? normalized.slice(0, 2) : "09"
  const minute = normalized ? normalized.slice(3, 5) : "00"

  const setPart = (h: string, m: string) => onChange(h + ":" + m)

  return (
    <div className={className}>
      {label && <p className="m-field-label">{label}</p>}
      <button
        type="button"
        onClick={() => { void hapticLight(); setOpen((v) => !v) }}
        aria-expanded={open}
        className="m-field-control m-pressable mt-2 flex min-h-[46px] w-full items-center gap-2 px-4 text-left"
      >
        <Icon icon={Clock} size="sm" tone="muted" />
        <span
          className={cn(
            "m-body min-w-0 flex-1 truncate",
            value ? "text-[var(--m-text)]" : "text-[var(--m-faint)]",
          )}
        >
          {value || placeholder}
        </span>
        <span className={cn("shrink-0 text-[var(--m-faint)] transition-transform duration-200", open && "rotate-180")}>
          <Icon icon={ChevronDown} size="sm" />
        </span>
      </button>

      {open && (
        <div className="m-enter mt-2 rounded-2xl bg-[var(--m-surface-2)] p-3">
          <div className="flex items-center gap-2">
            <Wheel label="小时" values={HOURS} value={hour} onChange={(h) => setPart(h, minute)} />
            <span className="self-center text-[18px] font-semibold text-[var(--m-faint)]" aria-hidden="true">:</span>
            <Wheel label="分钟" values={MINUTES} value={minute} onChange={(m) => setPart(hour, m)} />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="m-caption text-[var(--m-muted)]">
              选中 <b className="tabular-nums text-[var(--m-accent-strong)]">{hour}:{minute}</b>
            </span>
            <button
              type="button"
              onClick={() => { void hapticLight(); setOpen(false) }}
              className="m-press m-btn-primary min-h-[36px] rounded-full px-4 text-[13px] font-semibold"
            >
              完成
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default TimeField
