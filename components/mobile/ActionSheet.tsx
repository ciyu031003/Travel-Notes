'use client'

import { cn } from '@/lib/utils'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { hapticLight } from '@/lib/mobile/haptics'

export interface ActionSheetOption {
  label: string
  destructive?: boolean
  onClick?: () => void
}

/** iOS Action Sheet：选项列表 + 取消，破坏性项红色 */
export function ActionSheet({
  open,
  onClose,
  options,
  title,
}: {
  open: boolean
  onClose: () => void
  options: ActionSheetOption[]
  title?: string
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-2.5 pb-2">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => {
              void hapticLight()
              onClose()
              option.onClick?.()
            }}
            className={cn('m-action-item', option.destructive && 'is-danger')}
          >
            {option.label}
          </button>
        ))}
        <button type="button" onClick={onClose} className="m-action-item is-cancel">
          取消
        </button>
      </div>
    </BottomSheet>
  )
}
