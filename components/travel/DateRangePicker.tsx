'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { evaluateDateRange, parseLocalDate } from '@/lib/modules/travel/draft'

/**
 * 日期区间选择器（不引三方依赖）
 *
 * 为什么不用两个原生 `<input type="date">`（原实现）：
 *  · 安卓 WebView 里原生日期控件样式不可控、点击区域小、体验割裂；
 *  · 两个独立控件无法表达"这是一个区间"，用户不知道结束日选对没有；
 *  · 参考产品的做法是**一处定完并实时回显「共 N 天 M 晚」**，这里对齐它。
 *
 * 交互：点日期 = 设开始；再点 = 设结束（若早于开始则重设开始，符合直觉）。
 * 也支持"先点结束"——第二次点击总被解释为"区间的另一端"。
 */

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfMonthGrid(year: number, month: number): Date {
  const first = new Date(year, month, 1)
  // 周一为一周之首：周日(0) → 6
  const offset = (first.getDay() + 6) % 7
  return new Date(year, month, 1 - offset)
}

export default function DateRangePicker({
  startDate,
  endDate,
  onChange,
  onClose,
}: {
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

  const cells = useMemo(() => {
    const first = startOfMonthGrid(viewYear, viewMonth)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i)
      return { key: toKey(d), day: d.getDate(), inMonth: d.getMonth() === viewMonth }
    })
  }, [viewYear, viewMonth])

  const rangeStart = pendingStart ?? startDate
  const rangeEnd = pendingStart ? '' : endDate
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
    // 还没有开始 → 这次点击就是开始
    if (!pendingStart && !startDate) {
      setPendingStart(key)
      return
    }
    // 已在选第二段
    if (pendingStart) {
      if (key < pendingStart) {
        // 点在开始之前：把这次当新的开始，符合"区间两端"直觉
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

  const clear = () => {
    setPendingStart(null)
    onChange({ startDate: '', endDate: '' })
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
    <div className="fixed inset-0 z-[130] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="选择日期范围">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-t-3xl bg-[var(--m-surface-solid)] pb-[max(12px,env(safe-area-inset-bottom))] shadow-[var(--m-shadow-lg)]"
        style={{ maxHeight: '88dvh' }}
      >
        {/* 顶部：标题 + 实时天数 */}
        <div className="flex items-start justify-between px-5 pt-4">
          <div>
            <h3 className="text-[17px] font-semibold text-[var(--m-text)]">选择日期</h3>
            <p className="mt-0.5 text-[12px] text-[var(--m-muted)]">
              {info.error
                ? <span className="text-[var(--m-danger,#d9534f)]">{info.error}</span>
                : rangeStart && rangeEnd
                  ? `共 ${info.days} 天 ${info.nights} 晚`
                  : pendingStart
                    ? '再点一天作为结束日'
                    : '点一天作为开始日'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="rounded-full p-2 text-[var(--m-muted)] active:scale-95">
            <Icon icon={X} size="sm" />
          </button>
        </div>

        {/* 月份切换 */}
        <div className="mt-3 flex items-center justify-between px-4">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="上个月"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--m-text)] active:scale-95">
            <Icon icon={ChevronLeft} size="sm" />
          </button>
          <span className="text-[15px] font-medium text-[var(--m-text)]">{viewYear} 年 {viewMonth + 1} 月</span>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="下个月"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--m-text)] active:scale-95">
            <Icon icon={ChevronRight} size="sm" />
          </button>
        </div>

        {/* 星期表头 */}
        <div className="mt-1 grid grid-cols-7 px-3">
          {WEEK_LABELS.map((w) => (
            <span key={w} className="py-1.5 text-center text-[11px] text-[var(--m-faint)]">{w}</span>
          ))}
        </div>

        {/* 日期网格：每格 ≥44px 触控目标 */}
        <div className="grid grid-cols-7 gap-y-1 px-3 pb-1">
          {cells.map((c) => {
            const isEdge = c.key === rangeStart || c.key === rangeEnd
            const inRange = isInRange(c.key)
            const isToday = c.key === today
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => pick(c.key)}
                aria-pressed={isEdge}
                aria-label={c.key}
                className={[
                  'relative mx-auto flex h-11 w-11 items-center justify-center rounded-full text-[14px] transition',
                  isEdge
                    ? 'bg-[var(--m-accent)] font-semibold text-[var(--m-on-accent)]'
                    : inRange
                      ? 'bg-[var(--m-accent-soft)] text-[var(--m-accent-strong)]'
                      : c.inMonth
                        ? 'text-[var(--m-text)] active:scale-95'
                        : 'text-[var(--m-faint)]',
                ].join(' ')}
              >
                {c.day}
                {isToday && !isEdge && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[var(--m-accent)]" aria-hidden="true" />
                )}
              </button>
            )
          })}
        </div>

        {/* 底部操作 */}
        <div className="mt-2 flex gap-3 px-5 pt-3" style={{ borderTop: '1px solid var(--m-line)' }}>
          <button type="button" onClick={clear}
            className="rounded-full px-4 py-3 text-[14px] font-medium text-[var(--m-muted)] ring-1 ring-[var(--m-line)] active:scale-[0.97]">
            清除
          </button>
          <button type="button" onClick={confirm} disabled={!rangeStart && !pendingStart}
            className="h-12 flex-1 rounded-2xl bg-[var(--m-accent)] text-[15px] font-semibold text-[var(--m-on-accent)] transition active:scale-[0.98] disabled:opacity-40">
            {pendingStart ? '确定（单日）' : '确定'}
          </button>
        </div>
      </div>
    </div>
  )
}
