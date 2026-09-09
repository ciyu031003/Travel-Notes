'use client'

import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 底部抽屉：毛玻璃 + 拖拽把手 + 遮罩点击关闭 + 安全区，内容区可滚动 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
  dismissible = true,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
  dismissible?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) onClose()
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose, dismissible])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[95]">
      <button
        type="button"
        aria-label="关闭面板"
        tabIndex={-1}
        onClick={() => {
          if (dismissible) onClose()
        }}
        className="m-sheet-backdrop"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || '底部面板'}
        className={cn('m-sheet', className)}
      >
        <span className="m-sheet-grabber" aria-hidden="true" />
        {title && (
          <div className="m-sheet-head">
            <h2 className="text-[17px] font-semibold text-[var(--m-text)]">{title}</h2>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="m-sheet-close"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
        <div className="m-sheet-body">{children}</div>
      </div>
    </div>
  )
}
