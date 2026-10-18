'use client'

import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { useModalLayer } from '@/hooks/use-modal-layer'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** 面板宽度类（默认 max-w-md） */
  className?: string
  /** 点击遮罩关闭（默认 true） */
  closeOnBackdrop?: boolean
  /** 显示右上角关闭按钮（默认 true） */
  showClose?: boolean
  footer?: ReactNode
}

/**
 * 统一弹窗（UI-V3 P2-6）：createPortal 挂 body + scale-in 动画。
 *
 * P2-28：焦点圈定/恢复、背景 inert、滚动锁、ESC 与 Android 返回统一交给
 * hooks/use-modal-layer（此前这里只做 panel.focus()，Tab 会跑到遮罩下的背景控件）。
 * 与 BottomSheet/SideDrawer 走同一套实现，避免双层焦点陷阱。
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  closeOnBackdrop = true,
  showClose = true,
  footer,
}: ModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)

  useModalLayer({ open, onClose, panelRef })

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'relative w-full max-w-md rounded-2xl bg-semantic-surface p-5 shadow-xl outline-none',
          'motion-safe:animate-scale-in',
          className
        )}
      >
        {(title || showClose) && (
          <div className="mb-4 flex items-center justify-between gap-3">
            {title && (
              <h3 id={titleId} className="text-base font-semibold text-semantic-heading">
                {title}
              </h3>
            )}
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="ml-auto rounded-full p-1 text-semantic-muted transition hover:bg-semantic-accentWeak hover:text-semantic-text"
              >
                <Icon icon={X} size="sm" />
              </button>
            )}
          </div>
        )}
        {children}
        {footer && <div className="mt-5 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
