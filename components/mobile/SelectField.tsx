'use client'

import { useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { Icon } from './Icon'
import { hapticLight } from '@/lib/mobile/haptics'
import { cn } from '@/lib/utils'

/**
 * 下拉选择器（2026-10-13 新增）
 * ============================================================================
 * 为什么不用原生 <select>：在 Android WebView 上它会拉起**系统滚轮下拉**，
 * 造型与全站设计语言割裂（各 ROM 不一致），且无法显示副标题、无法做分组。
 *
 * 这里改为「字段 + 品牌化选项面板」：
 *  · 字段外观与 Field 完全一致（label / 值 / 箭头，触达 ≥46）；
 *  · 点击拉起 BottomSheet，选项为整行大触达，右侧勾选当前项；
 *  · 支持每项副标题（如行程的日期+时间），比原生选项信息量大；
 *  · 选中给轻触觉并立即回填。
 */

export interface SelectOption {
  value: string
  label: string
  /** 可选的第二行说明（如「2026-11-01 08:30」） */
  hint?: string
}

/** 字段形态的选择器（替换原生 select） */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = "请选择",
  className,
  sheetTitle,
}: {
  label?: string
  value: string
  options: SelectOption[]
  onChange: (next: string) => void
  placeholder?: string
  className?: string
  sheetTitle?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <>
      <div className={className}>
        {label && <p className="m-field-label">{label}</p>}
        <button
          type="button"
          onClick={() => { void hapticLight(); setOpen(true) }}
          aria-haspopup="listbox"
          className="m-field-control m-pressable mt-2 flex min-h-[46px] w-full items-center gap-2 px-4 text-left"
        >
          <span className={cn("m-body min-w-0 flex-1 truncate", selected ? "text-[var(--m-text)]" : "text-[var(--m-faint)]")}>
            {selected ? selected.label : placeholder}
          </span>
          <span className="shrink-0 text-[var(--m-faint)]">
            <Icon icon={ChevronDown} size="sm" />
          </span>
        </button>
      </div>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={sheetTitle || label || "请选择"}>
        <ul className="space-y-1" role="listbox">
          {options.map((o) => {
            const active = o.value === value
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    void hapticLight()
                    onChange(o.value)
                    setOpen(false)
                  }}
                  className={cn(
                    "m-pressable flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors",
                    active ? "bg-[var(--m-accent-soft)]" : "active:bg-[var(--m-surface-2)]",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn("m-body block truncate", active ? "font-semibold text-[var(--m-accent-strong)]" : "text-[var(--m-text)]")}>
                      {o.label}
                    </span>
                    {o.hint && <span className="m-caption mt-0.5 block truncate text-[var(--m-muted)]">{o.hint}</span>}
                  </span>
                  {active && <Icon icon={Check} size="sm" tone="accent" />}
                </button>
              </li>
            )
          })}
        </ul>
      </BottomSheet>
    </>
  )
}

export default SelectField
