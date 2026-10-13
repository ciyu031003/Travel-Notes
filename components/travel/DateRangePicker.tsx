'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { Button } from '@/components/mobile/Button'
import { Icon } from '@/components/mobile/Icon'
import { hapticLight } from '@/lib/mobile/haptics'
import { evaluateDateRange, parseLocalDate } from '@/lib/modules/travel/draft'
import { cn } from '@/lib/utils'

/**
 * 日期区间选择器（2026-10-13 重做视觉与交互）
 *
 * 为什么不用两个原生 `<input type="date">`：安卓 WebView 里原生日期控件样式不可控、
 * 点击区域小、体验割裂；两个独立控件也无法表达「这是一个区间」。
 *
 * 本轮重做的三点（真机反馈「这个圆形弹窗做得挺丑的」）：
 *  ① 换用品牌化 BottomSheet：弹簧入场、可下拉关闭、接管系统返回，
 *     不再是裸 fixed 层「凭空出现」；
 *  ② 日期格：原先每格是**孤立圆圈**，区间表达很弱；改为「连续色带 + 两端圆角」，
 *     一眼能看出从哪天到哪天；
 *  ③ 顶部加常用区间快捷项（今天 / 明天 / 本周末 / 三天 / 一周），
 *     绝大多数行程一次点击就选好，不用翻月份。
 *
 * 交互：点一天 = 设开始；再点 = 设结束（点在开始之前则重设开始，符合"区间两端"直觉）。
 */

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"]

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days)
}

function startOfMonthGrid(year: number, month: number): Date {
  const first = new Date(year, month, 1)
  // 周一为一周之首：周日(0) → 6
  const offset = (first.getDay() + 6) % 7
  return new Date(year, month, 1 - offset)
}

export default function DateRangePicker({
  open,
  startDate,
  endDate,
  onChange,
  onClose,
}: {
  /** 由父级控制显隐：保持挂载才能播完 BottomSheet 的弹簧退场动画 */
  open: boolean
  startDate: string
  endDate: string
  onChange: (next: { startDate: string; endDate: string }) => void
  onClose: () => void
}) {
  const initial = parseLocalDate(startDate) ?? new Date()
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())
  // 第一段已选、等待第二段
  const [pendingStart, setPendingStart] = useState<string | null>(null)

  const today = useMemo(() => {
    const t = new Date()
    return toKey(new Date(t.getFullYear(), t.getMonth(), t.getDate()))
  }, [])

  /** 常用区间：一次点击直接选好，省去翻月份 */
  const presets = useMemo(() => {
    const base = new Date()
    // 本周六：getDay() 0=周日；距离下一个周六的天数
    const dow = base.getDay()
    const toSat = (6 - dow + 7) % 7
    const sat = addDays(base, toSat)
    return [
      { label: "今天", start: toKey(base), end: toKey(base) },
      { label: "明天", start: toKey(addDays(base, 1)), end: toKey(addDays(base, 1)) },
      { label: "本周末", start: toKey(sat), end: toKey(addDays(sat, 1)) },
      { label: "三天", start: toKey(base), end: toKey(addDays(base, 2)) },
      { label: "一周", start: toKey(base), end: toKey(addDays(base, 6)) },
    ]
  }, [])

  const cells = useMemo(() => {
    const first = startOfMonthGrid(viewYear, viewMonth)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i)
      return { key: toKey(d), day: d.getDate(), inMonth: d.getMonth() === viewMonth }
    })
  }, [viewYear, viewMonth])

  const rangeStart = pendingStart ?? startDate
  const rangeEnd = pendingStart ? "" : endDate
  const info = evaluateDateRange(rangeStart, rangeEnd)

  const isInRange = (key: string) => {
    if (!rangeStart || !rangeEnd) return false
    return key > rangeStart && key < rangeEnd
  }

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const pick = (key: string) => {
    void hapticLight()
    // 还没有开始 → 这次点击就是开始
    if (!pendingStart && !startDate) {
      setPendingStart(key)
      return
    }
    // 已在选第二段
    if (pendingStart) {
      if (key < pendingStart) {
        setPendingStart(key)
        return
      }
      onChange({ startDate: pendingStart, endDate: key })
      setPendingStart(null)
      return
    }
    // 已有完整区间：重新开始选
    setPendingStart(key)
  }

  const applyPreset = (start: string, end: string) => {
    void hapticLight()
    onChange({ startDate: start, endDate: end })
    setPendingStart(null)
    const d = parseLocalDate(start)
    if (d) {
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }

  const clear = () => {
    setPendingStart(null)
    onChange({ startDate: "", endDate: "" })
  }

  const confirm = () => {
    if (pendingStart) {
      // 只选了一天：当作单日旅行
      onChange({ startDate: pendingStart, endDate: pendingStart })
      setPendingStart(null)
      return
    }
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="选择日期">
      <div className="space-y-3.5">
        {/* 实时状态：天数 / 下一步提示 */}
        <div className="flex items-center gap-2 text-[13px]">
          <Icon icon={CalendarDays} size="sm" tone="accent" />
          {info.error ? (
            <span className="text-[var(--m-danger)]">{info.error}</span>
          ) : rangeStart && rangeEnd ? (
            <span className="font-medium text-[var(--m-accent-strong)]">
              共 {info.days} 天 {info.nights} 晚
            </span>
          ) : pendingStart ? (
            <span className="text-[var(--m-muted)]">再点一天作为结束日</span>
          ) : (
            <span className="text-[var(--m-muted)]">点一天作为开始日</span>
          )}
        </div>

        {/* 常用区间 */}
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const active = startDate === p.start && endDate === p.end
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.start, p.end)}
                aria-pressed={active}
                className={cn(
                  "m-press min-h-[36px] rounded-full px-3.5 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-[var(--m-cta-bg)] text-[var(--m-on-accent)]"
                    : "bg-[var(--m-surface-2)] text-[var(--m-muted)]",
                )}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {/* 月份切换 */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="上个月"
            className="m-pressable flex h-10 w-10 items-center justify-center rounded-full text-[var(--m-text)]"
          >
            <Icon icon={ChevronLeft} size="sm" />
          </button>
          <span className="text-[15px] font-semibold tabular-nums text-[var(--m-text)]">
            {viewYear} 年 {viewMonth + 1} 月
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="下个月"
            className="m-pressable flex h-10 w-10 items-center justify-center rounded-full text-[var(--m-text)]"
          >
            <Icon icon={ChevronRight} size="sm" />
          </button>
        </div>

        {/* 星期表头 */}
        <div className="grid grid-cols-7">
          {WEEK_LABELS.map((w) => (
            <span key={w} className="py-1 text-center text-[11px] text-[var(--m-faint)]">{w}</span>
          ))}
        </div>

        {
          /*
            日期网格：每格是**整列宽**的按钮（承载连续色带），内层 span 才是圆。
            这样区间会连成一条带，而不是一串孤立圆圈 —— 视觉上一眼看出起止。
          */
        }
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((c) => {
            const isStart = c.key === rangeStart
            const isEnd = c.key === rangeEnd
            const inRange = isInRange(c.key)
            const isToday = c.key === today
            const single = isStart && isEnd
            const showBand = single || isStart || isEnd || inRange
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => pick(c.key)}
                aria-pressed={isStart || isEnd}
                aria-label={c.key}
                className={cn(
                  "relative flex h-11 items-center justify-center",
                  // 连续色带：起点右侧圆角收边、终点左侧收边、中间不留缝
                  showBand && !single && inRange && "bg-[var(--m-accent-soft)]",
                  showBand && !single && isStart && "rounded-l-full bg-[var(--m-accent-soft)]",
                  showBand && !single && isEnd && "rounded-r-full bg-[var(--m-accent-soft)]",
                )}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full text-[14px] tabular-nums transition-colors",
                    isStart || isEnd
                      ? "bg-[var(--m-accent)] font-semibold text-[var(--m-on-accent)]"
                      : inRange
                        ? "text-[var(--m-accent-strong)]"
                        : c.inMonth
                          ? "text-[var(--m-text)]"
                          : "text-[var(--m-faint)]",
                  )}
                >
                  {c.day}
                </span>
                {isToday && !(isStart || isEnd) && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[var(--m-accent)]" aria-hidden="true" />
                )}
              </button>
            )
          })}
        </div>

        {/* 底部操作 */}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={clear}>清除</Button>
          <Button
            block
            size="lg"
            className="flex-1"
            disabled={!rangeStart && !pendingStart}
            onClick={confirm}
          >
            {pendingStart ? "确定（单日）" : "确定"}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
