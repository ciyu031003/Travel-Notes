'use client'

import { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { Icon } from './Icon'
import { hapticLight } from '@/lib/mobile/haptics'
import { cn } from '@/lib/utils'

/**
 * 时间滚轮（2026-10-15 第二版）
 * ============================================================================
 * 需求：行程的「开始 / 结束」用滚轮选时间（左边小时、右边分钟），不要方格。
 *
 * 为什么会有第二版：第一版滚轮把 onChange 绑在 onScroll 上，并且每次值变化都在
 * effect 里程序化改 scrollTop —— 两者构成反馈环
 * （scroll → setState → effect 改 scrollTop → 再触发 scroll），真机上卡死/闪退、
 * 值也选不准。第一版之后的方格版虽然稳，但不是想要的手感。
 *
 * 这一版的三个关键约束（改这段代码前请先读）：
 *  ① **滚动停止后才取值**：onScroll 只做防抖，静止 140ms 才把选中项回写，
 *     绝不在滚动过程中持续 setState；
 *  ② **程序化滚动不参与回写**：定位期间用 programmaticRef 屏蔽取值，
 *     且只在「当前位置与目标差 > 1px」时才滚动，静止后不会反复触发；
 *  ③ **内联在表单里，不再是嵌套弹层**：此前时间选择器是抽屉里再开一层
 *     BottomSheet，两个 modal 叠加会互相干扰（关内层把外层也带走 →
 *     真机反馈「确定后直接回到总览、时间没写入」）。内联后没有第二层 modal。
 */

const ITEM_H = 40 // 滚轮单行高度，需与下方 style 的 height 一致
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
 * 注意这里**没有** onScroll → onChange 的直接绑定：滚动只做防抖计时，
 * 静止后才读一次最终位置。这是避免反馈环的关键。
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
  const settleTimer = useRef<number | null>(null)
  const programmaticRef = useRef(false)
  const idx = Math.max(0, values.indexOf(value))

  // 只在「外部值与当前滚轮位置不一致」时定位一次；静止后不会反复滚动
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const target = idx * ITEM_H
    if (Math.abs(el.scrollTop - target) <= 1) return
    programmaticRef.current = true
    el.scrollTop = target
    const t = window.setTimeout(() => { programmaticRef.current = false }, 120)
    return () => window.clearTimeout(t)
  }, [idx])

  useEffect(
    () => () => { if (settleTimer.current) window.clearTimeout(settleTimer.current) },
    [],
  )

  const handleScroll = () => {
    if (programmaticRef.current) return
    if (settleTimer.current) window.clearTimeout(settleTimer.current)
    // 防抖：只有滚动停下来才取值并回写
    settleTimer.current = window.setTimeout(() => {
      const el = ref.current
      if (!el) return
      const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM_H)))
      const next = values[i]
      if (next && next !== value) {
        void hapticLight()
        onChange(next)
      }
    }, 140)
  }

  return (
    <div className="relative flex-1" role="listbox" aria-label={label}>
      {/* 中央选中带：纯视觉，不拦手势 */}
      <div
        className="pointer-events-none absolute inset-x-1 top-1/2 z-10 -translate-y-1/2 rounded-xl bg-[var(--m-accent-soft)]"
        style={{ height: ITEM_H }}
        aria-hidden="true"
      />
      <div
        ref={ref}
        onScroll={handleScroll}
        className="m-wheel m-wheel-mask relative"
        style={{ height: ITEM_H * 5 }}
      >
        {/* 上下各留 2 行，让首尾项也能滚到中间 */}
        <div style={{ height: ITEM_H * 2 }} aria-hidden="true" />
        {values.map((v) => (
          <div
            key={v}
            role="option"
            aria-selected={v === value}
            className={cn(
              "flex items-center justify-center tabular-nums transition-colors duration-150",
              v === value
                ? "text-[18px] font-semibold text-[var(--m-accent-strong)]"
                : "text-[15px] text-[var(--m-faint)]",
            )}
            style={{ height: ITEM_H }}
          >
            {v}
          </div>
        ))}
        <div style={{ height: ITEM_H * 2 }} aria-hidden="true" />
      </div>
    </div>
  )
}

/**
 * 时间字段：点击在**下方内联展开**滚轮（左小时 / 右分钟）。
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
      </button>

      {open && (
        <div className="m-enter mt-2 rounded-2xl bg-[var(--m-surface-2)] p-3">
          <div className="flex items-center gap-3">
            <Wheel label="小时" values={HOURS} value={hour} onChange={(h) => setPart(h, minute)} />
            <span className="self-center text-[18px] font-semibold text-[var(--m-faint)]" aria-hidden="true">:</span>
            <Wheel label="分钟" values={MINUTES} value={minute} onChange={(m) => setPart(hour, m)} />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="m-caption text-[var(--m-muted)]">
              选中 {hour}:{minute}
            </span>
            <button
              type="button"
              onClick={() => { void hapticLight(); setOpen(false) }}
              className="m-press min-h-[36px] rounded-full bg-[var(--m-cta-bg)] px-4 text-[13px] font-semibold text-[var(--m-on-accent)]"
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
