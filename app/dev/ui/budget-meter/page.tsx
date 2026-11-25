'use client'

import { useState } from 'react'
import BudgetMeter, { toneForBudget } from '@/components/mobile/BudgetMeter'

/** 调试页（仅开发环境公开）：BoardUI Meter 规格落地的预算进度条 */

const CASES = [
  { label: '正常（12%）', value: 1200, max: 10000 },
  { label: '过半（56%）', value: 5600, max: 10000 },
  { label: '接近预算（86%）', value: 8600, max: 10000 },
  { label: '超支（128%）', value: 12800, max: 10000 },
]

export default function BudgetMeterPreviewPage() {
  const [value, setValue] = useState(5600)
  const max = 10000
  const percent = (value / max) * 100

  return (
    <main className="mx-auto w-full max-w-[430px] px-5 py-10">
      <h1 className="text-[18px] font-bold text-[var(--m-text)]">预算 Meter · 预览</h1>
      <p className="mt-1 text-[13px] leading-6 text-[var(--m-muted)]">
        按 BoardUI meter 的规格本地实现（role=meter、label/value 行、四档 tone、transform 缓动填充）。
      </p>

      <section className="mt-5 rounded-2xl bg-[var(--m-surface-solid)] p-4 shadow-[var(--m-shadow-l1)]">
        <p className="text-[13px] font-semibold text-[var(--m-text)]">交互：拖动看 tone 变化</p>
        <input
          type="range"
          min={0}
          max={15000}
          step={100}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="mt-3 w-full"
          aria-label="调整已花金额"
        />
        <BudgetMeter
          className="mt-4"
          label="预算使用"
          valueLabel={'¥' + value.toLocaleString('zh-CN') + ' / ¥' + max.toLocaleString('zh-CN')}
          value={value}
          max={max}
          tone={toneForBudget(percent)}
          description={value > max ? '已超出预算' : '还剩 ¥' + (max - value).toLocaleString('zh-CN')}
        />
      </section>

      <section className="mt-5 space-y-4 rounded-2xl bg-[var(--m-surface-solid)] p-4 shadow-[var(--m-shadow-l1)]">
        {CASES.map((c) => (
          <BudgetMeter
            key={c.label}
            label={c.label}
            valueLabel={Math.round((c.value / c.max) * 100) + '%'}
            value={c.value}
            max={c.max}
            tone={toneForBudget((c.value / c.max) * 100)}
            size={c.value > 10000 ? 'lg' : 'md'}
          />
        ))}
      </section>
    </main>
  )
}
