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
 * 关键设计：每个选项**用它自己的主题色渲染**（各自套一层 data-space），
 * 于是用户在创建时就能直接看到「选了这个类型，空间长什么样」——
 * 这是五套配色最好的自说明，也省掉了一屏纯文案说明。
 *
 * 与列表页共用同一套视觉语汇：类型色块（.space-cover）+ 玻璃类型色文字 +
 * 2xl 圆角。选中态不铺实心（实心留给页面唯一的 CTA），只用类型色描边环 +
 * 淡染底，和卡片的「彩色封面 + 中性正文」保持同一套彩度纪律。
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
          // OTHER 占满一行：五项在 2 栏网格里不留半格空洞
          <SpaceThemeScope
            key={type}
            type={type}
            className={type === 'OTHER' ? 'col-span-2' : undefined}
          >
            <button
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(type)}
              className={cn(
                'm-pressable flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left disabled:opacity-60',
                active
                  ? 'space-ring bg-[var(--ui-space-accent-soft)]'
                  : 'bg-[var(--ui-social-surface)] ring-1 ring-[var(--ui-social-line)]',
              )}
            >
              {/* 类型色块：与空间卡片的封面同源（.space-cover），一眼看到这套配色 */}
              <span className="space-cover flex h-10 w-10 flex-none items-center justify-center rounded-xl">
                <Icon
                  icon={spaceTypeIconOf(type)}
                  size="md"
                  className="text-[var(--ui-space-accent-text)]"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  <span
                    className={cn(
                      'truncate text-[15px] font-semibold',
                      active
                        ? 'text-[var(--ui-space-accent-text)]'
                        : 'text-[var(--ui-social-text)]',
                    )}
                  >
                    {spaceTypeLabelOf(type)}
                  </span>
                  {active && (
                    <Icon
                      icon={Check}
                      size="sm"
                      className="flex-none text-[var(--ui-space-accent-strong)]"
                    />
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-[var(--ui-social-faint)]">
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
