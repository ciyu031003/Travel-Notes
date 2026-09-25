'use client'

import { Check } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { cn } from '@/lib/utils'
import {
  SPACE_TYPES,
  spaceTypeHintOf,
  spaceTypeIconOf,
  spaceTypeLabelOf,
} from '@/lib/mobile/space-system'
import { SpaceThemeScope } from './SpaceThemeScope'

/**
 * 空间类型选择器（创建 / 编辑空间时用）。
 *
 * 关键设计：每张卡片**用它自己的主题色渲染**（各自套一层 `data-space`），
 * 于是用户在创建时就能直接看到"选了这个类型，空间长什么样" ——
 * 这是五套配色最好的自说明，也省掉了一屏纯粹的文案说明。
 *
 * 选中态刻意不用实心填充（实心留给页面唯一的 CTA），只加外圈描边 + 淡染底，
 * 满足「单屏最多一个实心 CTA」的规范。
 */
export function SpaceTypePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label="空间类型" className="grid grid-cols-2 gap-2">
      {SPACE_TYPES.map((type) => {
        const active = value === type
        return (
          <SpaceThemeScope key={type} type={type}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(type)}
              className={cn(
                'w-full overflow-hidden rounded-[var(--m-radius-control)] text-left transition active:scale-[0.98] disabled:opacity-60',
                active
                  ? 'bg-[var(--space-accent-soft)] space-ring'
                  : 'bg-[var(--social-surface)] ring-1 ring-[var(--social-line)]',
              )}
            >
              {/* 主题色预览条：用户在这里"看到"这套配色 */}
              <span className="space-hero block h-9 w-full" aria-hidden="true" />
              <span className="block px-3 py-2.5">
                <span className="flex items-center gap-1.5">
                  <Icon
                    icon={spaceTypeIconOf(type)}
                    size="sm"
                    className={active ? 'text-[var(--space-accent-strong)]' : 'text-[var(--social-muted)]'}
                  />
                  <span
                    className={cn(
                      'text-[13px] font-semibold',
                      active ? 'text-[var(--space-accent-text)]' : 'text-[var(--social-text)]',
                    )}
                  >
                    {spaceTypeLabelOf(type)}
                  </span>
                  {active && (
                    <Icon icon={Check} size="sm" className="ml-auto text-[var(--space-accent-strong)]" />
                  )}
                </span>
                <span className="mt-0.5 block text-[11px] text-[var(--social-faint)]">
                  {spaceTypeHintOf(type)}
                </span>
              </span>
            </button>
          </SpaceThemeScope>
        )
      })}
    </div>
  )
}

export default SpaceTypePicker
