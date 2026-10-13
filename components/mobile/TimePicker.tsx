'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Icon } from './Icon'
import { hapticLight } from '@/lib/mobile/haptics'
import { cn } from '@/lib/utils'

/**
 * 时间选择器（2026-10-13 新增）
 * ============================================================================
 * 为什么不用原生 <input type="time">：在 Android WebView 上它会拉起**系统圆盘钟表**，
 * 造型与全站暖陶土设计语言完全割裂，且各 ROM 长相不一（真机反馈「这个圆形钟表挺丑的」）。
 *
 * 这里自绘「吸附滚轮」：
 *  · 两列（时 / 分）scroll-snap 居中吸附，中间高亮带 + 上下渐隐遮罩；
 *  · 打开时自动滚到当前值并高亮，切换时给轻触觉；
 *  · 顶部给常用时间快捷项（早/午/晚），常用场景少滚动；
 *  · 全程只动 transform/opacity，走既有 --m-* token（规范 §2/§7）。
 */

const ITEM_H = 44          // 与 .m-wheel-item 高度一致（44 = 规范最小触达）
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
/** 分钟按 5 分钟一档：既够用，又不会让用户滚太久 */
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"))
const QUICK = [
  { label: "早上", value: "08:00" },
  { label: "中午", value: "12:00" },
  { label: "下午", value: "14:00" },
  { label: "傍晚", value: "18:00" },
  { label: "晚上", value: "20:00" },
]

function normalizeTime(v: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(v || "")
  if (!m) return ""
  const h = Math.min(23, Math.max(0, Number(m[1])))
  const rawMin = Number(m[2])
  // 对齐到 5 分钟档，避免出现滚轮里没有的值（例如 :07）
  const min = Math.min(55, Math.round(rawMin / 5) * 5)
  return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0")
}

/** 单列滚轮：吸附 + 高亮 + 快照 */
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
  const idx = Math.max(0, values.indexOf(value))
  /** 屏蔽"程序化滚动"触发的 onChange，避免打开瞬间误改值 */
  const silentRef = useRef(false)

  // 打开/外部值变化时滚到目标项
  useEffect(() => {
    const el = ref.current
    if (!el) return
    silentRef.current = true
    el.scrollTop = idx * ITEM_H
    const t = window.setTimeout(() => { silentRef.current = false }, 60)
    return () => window.clearTimeout(t)
    // 仅在挂载与外部值变化时定位；拖动过程中不干预
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx])

  const handleScroll = () => {
    const el = ref.current
    if (!el || silentRef.current) return
    const next = values[Math.round(el.scrollTop / ITEM_H)]
    if (next && next !== value) {
      void hapticLight()
      onChange(next)
    }
  }

  return (
    <div className="relative flex-1" role="listbox" aria-label={label}>
      {/* 中央高亮带：纯视觉层，不拦截手势 */}
      <div className="m-wheel-band pointer-events-none absolute inset-x-1 top-1/2 z-10 -translate-y-1/2" style={{ height: ITEM_H }} aria-hidden="true" />
      <div
        ref={ref}
        onScroll={handleScroll}
        className="m-wheel m-wheel-mask relative"
        style={{ height: ITEM_H * 5 }}
      >
        {/* 上下各留 (5-1)/2 个空位，让首尾项也能居中 */}
        <div style={{ height: ITEM_H * 2 }} aria-hidden="true" />
        {values.map((v) => (
          <div
            key={v}
            role="option"
            aria-selected={v === value}
            className={cn(
              "m-wheel-item flex items-center justify-center tabular-nums",
              // 字号只用字阶内的档位（18 / 15）：选中项放大 + 加重即形成层级，
              // 不需要引入字阶外的魔术字号。
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

/** 时间字段：外观与 Field 一致，点击拉起自绘滚轮（不触发原生钟表） */
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
          <span className={cn("m-body flex-1 truncate", value ? "text-[var(--m-text)]" : "text-[var(--m-faint)]")}>
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

/** 自绘时间滚轮面板 */
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

  // 每次打开都与外部值对齐（避免上次取消后残留）
  useEffect(() => {
    if (!open) return
    const v = normalizeTime(value) || "09:00"
    setHour(v.slice(0, 2))
    setMinute(v.slice(3, 5))
  }, [open, value])

  const current = useMemo(() => hour + ":" + minute, [hour, minute])

  return (
    <BottomSheet open={open} onClose={onClose} title={title || "选择时间"}>
      <div className="space-y-4">
        {/* 常用时间：少滚动就能选中大多数场景 */}
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

        {/* 双列滚轮 */}
        <div className="flex items-stretch gap-3">
          <Wheel label="小时" values={HOURS} value={hour} onChange={setHour} />
          <span className="self-center text-[18px] font-semibold text-[var(--m-faint)]" aria-hidden="true">:</span>
          <Wheel label="分钟" values={MINUTES} value={minute} onChange={setMinute} />
        </div>

        <Button block size="lg" onClick={() => onConfirm(current)}>
          确定 · {current}
        </Button>
      </div>
    </BottomSheet>
  )
}

export default TimeSheet
