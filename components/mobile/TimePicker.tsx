'use client'

import { useEffect, useMemo, useState } from 'react'
import { Clock, Check } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Icon } from './Icon'
import { hapticLight } from '@/lib/mobile/haptics'
import { cn } from '@/lib/utils'

/**
 * 时间选择器（2026-10-14 改为纯点选）
 * ============================================================================
 * 为什么不用原生 <input type="time">：Android WebView 会拉起**系统圆盘钟表**，
 * 与全站暖陶土设计语言割裂，各 ROM 造型还不一致（真机反馈「这个圆形钟表挺丑的」）。
 *
 * 为什么不做「滚动吸附滚轮」：第一版做成 scroll-snap 滚轮 + 滚动监听回写值 +
 * 程序化 scrollTop 定位，三者构成**反馈环**（scroll → setState → effect 改 scrollTop
 * → 再触发 scroll …）。真机表现为卡死/闪退，且时间选不准。
 * 现在改为**纯点选**：小时网格 + 分钟快捷档，没有任何 scroll 监听、没有程序化滚动，
 * 结构上不可能出现反馈环；触达 44×44，也比滚轮好点。
 */

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
/** 分钟按 5 分钟一档：够用，且一屏放得下不用滚 */
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"))
const QUICK = [
  { label: "早上", value: "08:00" },
  { label: "中午", value: "12:00" },
  { label: "下午", value: "14:00" },
  { label: "傍晚", value: "18:00" },
  { label: "晚上", value: "20:00" },
]

/** 归一化为 HH:mm，并对齐到 5 分钟档（不会出现选不到的值） */
export function normalizeTime(v: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(v || "")
  if (!m) return ""
  const h = Math.min(23, Math.max(0, Number(m[1])))
  const min = Math.min(55, Math.round(Number(m[2]) / 5) * 5)
  return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0")
}

/** 时间字段：外观与 Field 一致，点击拉起自绘面板（不触发原生钟表） */
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
  return (
    <>
      <div className={className}>
        {label && <p className="m-field-label">{label}</p>}
        <button
          type="button"
          onClick={() => { void hapticLight(); setOpen(true) }}
          className="m-field-control m-pressable mt-2 flex min-h-[46px] w-full items-center gap-2 px-4 text-left"
        >
          <Icon icon={Clock} size="sm" tone="muted" />
          <span className={cn("m-body min-w-0 flex-1 truncate", value ? "text-[var(--m-text)]" : "text-[var(--m-faint)]")}>
            {value || placeholder}
          </span>
        </button>
      </div>
      <TimeSheet
        open={open}
        title={label || "选择时间"}
        value={value}
        onClose={() => setOpen(false)}
        onConfirm={(next) => { onChange(next); setOpen(false) }}
      />
    </>
  )
}

/** 时间选择面板（纯点选） */
export function TimeSheet({
  open,
  title,
  value,
  onClose,
  onConfirm,
}: {
  open: boolean
  title?: string
  value: string
  onClose: () => void
  onConfirm: (next: string) => void
}) {
  const initial = normalizeTime(value) || "09:00"
  const [hour, setHour] = useState(initial.slice(0, 2))
  const [minute, setMinute] = useState(initial.slice(3, 5))

  // 每次打开与外部值对齐（上次取消后不残留）
  useEffect(() => {
    if (!open) return
    const v = normalizeTime(value) || "09:00"
    setHour(v.slice(0, 2))
    setMinute(v.slice(3, 5))
  }, [open, value])

  const current = useMemo(() => hour + ":" + minute, [hour, minute])

  const pickHour = (h: string) => { void hapticLight(); setHour(h) }
  const pickMinute = (m: string) => { void hapticLight(); setMinute(m) }

  return (
    <BottomSheet open={open} onClose={onClose} title={title || "选择时间"}>
      <div className="space-y-4">
        {/* 常用时间：少点两下就能选中大多数场景 */}
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => {
            const active = current === q.value
            return (
              <button
                key={q.value}
                type="button"
                onClick={() => {
                  void hapticLight()
                  setHour(q.value.slice(0, 2))
                  setMinute(q.value.slice(3, 5))
                }}
                aria-pressed={active}
                className={cn(
                  "m-press min-h-[36px] rounded-full px-3.5 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-[var(--m-cta-bg)] text-[var(--m-on-accent)]"
                    : "bg-[var(--m-surface-2)] text-[var(--m-muted)]",
                )}
              >
                {q.label} {q.value}
              </button>
            )
          })}
        </div>

        {/* 当前选择：大号回显，确认前一眼看清 */}
        <div className="flex items-center justify-center rounded-2xl bg-[var(--m-surface-2)] py-3">
          <span className="text-[24px] font-bold tabular-nums text-[var(--m-accent-strong)]">{current}</span>
        </div>

        {/* 小时网格：24 项 6 列，每格 44 触达；容器可滚但不监听 scroll */}
        <div>
          <p className="m-field-label">小时</p>
          <div className="mt-2 grid max-h-[132px] grid-cols-6 gap-1.5 overflow-y-auto pr-1">
            {HOURS.map((h) => {
              const active = h === hour
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => pickHour(h)}
                  aria-pressed={active}
                  className={cn(
                    "m-press flex h-11 items-center justify-center rounded-xl text-[15px] tabular-nums transition-colors",
                    active
                      ? "bg-[var(--m-cta-bg)] font-semibold text-[var(--m-on-accent)]"
                      : "bg-[var(--m-surface-2)] text-[var(--m-text)]",
                  )}
                >
                  {h}
                </button>
              )
            })}
          </div>
        </div>

        {/* 分钟快捷档 */}
        <div>
          <p className="m-field-label">分钟</p>
          <div className="mt-2 grid grid-cols-6 gap-1.5">
            {MINUTES.map((m) => {
              const active = m === minute
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickMinute(m)}
                  aria-pressed={active}
                  className={cn(
                    "m-press flex h-11 items-center justify-center rounded-xl text-[15px] tabular-nums transition-colors",
                    active
                      ? "bg-[var(--m-cta-bg)] font-semibold text-[var(--m-on-accent)]"
                      : "bg-[var(--m-surface-2)] text-[var(--m-text)]",
                  )}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </div>

        <Button block size="lg" onClick={() => onConfirm(current)}>
          确定 · {current}
        </Button>
      </div>
    </BottomSheet>
  )
}

export default TimeSheet
