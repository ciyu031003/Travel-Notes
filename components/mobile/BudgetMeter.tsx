'use client'

import { useMemo } from 'react'

/**
 * 预算进度「Meter」—— 按 BoardUI 的 Meter 组件规格落地（2026-11-26）
 * ============================================================================
 * 来源：BoardUI 的 `meter`（https://www.boardui.com/components/meter）。
 * 它把「一个已知区间里的量」（预算/座位/配额）和「任务进度」区分开：语义是
 * `role="meter"` 而不是 `role="progressbar"`，并按占用比例给 status tone。
 *
 * 为什么是**移植规格**而不是直接装 BoardUI 的组件：BoardUI 的 meter 依赖
 * `react-aria-components`（连同 progress/input/cx 一整串依赖），我们这版是
 * 15MB 的离线移动壳，为首屏外的预算条引入 react-aria 不划算（且它的主题 token
 * 是 BoardUI 自己的 background / text 语义色体系）。这里保留它的四条关键规格：
 *   ① 语义：role=meter + aria-valuemin/max/now/valuetext；
 *   ② 结构：label 行（左标签 / 右格式化数值）+ 轨道 + 说明文字；
 *   ③ 状态色：accent / success / warning / error 四档 tone，由占用比例决定；
 *   ④ 动效：填充用 transform 缓动（不是 width，避免每帧重排）。
 * 颜色/字号走我们的 --m-* token 与 7 档字阶。
 */

export type BudgetTone = 'accent' | 'success' | 'warning' | 'danger'

const TONE_COLOR: Record<BudgetTone, string> = {
  accent: 'var(--m-accent)',
  success: 'var(--m-success)',
  warning: 'var(--m-warning)',
  danger: 'var(--m-danger)',
}

const TONE_TEXT: Record<BudgetTone, string> = {
  accent: 'var(--m-accent-strong)',
  success: 'var(--m-success)',
  warning: 'var(--m-warning)',
  danger: 'var(--m-danger)',
}

/** 轨道粗细（对应 BoardUI 的 4 / 6 / 8px 三档） */
const SIZE_CLASS = {
  sm: 'h-1',
  md: 'h-1.5',
  lg: 'h-2',
} as const

/**
 * 按占用比例推荐 tone：<80% 健康（success 绿）· 80–100% 提醒（warning 琥珀）·
 * 超支（danger 红）。三档颜色本身就是"还能不能花"的语义，比单纯的品牌色更直观。
 */
export function toneForBudget(percent: number): BudgetTone {
  if (percent > 100) return 'danger'
  if (percent >= 80) return 'warning'
  return 'success'
}

export interface BudgetMeterProps {
  label?: string
  /** 右上角的格式化数值，如「¥2,708 / ¥5,000」 */
  valueLabel?: string
  value: number
  max: number
  tone?: BudgetTone
  size?: keyof typeof SIZE_CLASS
  description?: string
  className?: string
}

export default function BudgetMeter({
  label,
  valueLabel,
  value,
  max,
  tone = 'accent',
  size = 'md',
  description,
  className,
}: BudgetMeterProps) {
  const safeMax = max > 0 ? max : 1
  const percent = useMemo(() => Math.max(0, Math.min(100, (value / safeMax) * 100)), [value, safeMax])
  const text = valueLabel || Math.round(percent) + '%'

  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={label ? label + ' ' + text : text}
      className={'flex w-full flex-col gap-1.5' + (className ? ' ' + className : '')}
    >
      {label || text ? (
        <div className="flex items-baseline justify-between gap-3">
          {label ? <span className="min-w-0 truncate text-[11px] font-medium text-[var(--m-muted)]">{label}</span> : <span />}
          <span className="shrink-0 text-[11px] tabular-nums" style={{ color: TONE_TEXT[tone] }}>
            {text}
          </span>
        </div>
      ) : null}

      <div className={'w-full overflow-hidden rounded-full bg-[var(--m-surface-2)] ' + SIZE_CLASS[size]}>
        <div
          className="h-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,0.61,0.36,1)]"
          style={{
            backgroundColor: TONE_COLOR[tone],
            transform: 'scaleX(' + (percent / 100).toFixed(4) + ')',
          }}
        />
      </div>

      {description ? <p className="text-[11px] leading-4 text-[var(--m-faint)]">{description}</p> : null}
    </div>
  )
}
