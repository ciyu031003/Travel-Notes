'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
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
 * 统一弹窗（UI-V3 P2-6）：createPortal 挂 body + 滚动锁 + ESC 关闭 + 焦点收拢 + scale-in 动画。
 * 无障碍：role=dialog + aria-modal + aria-labelledby；`prefers-reduced-motion` 下禁用动画。
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
  const lastFocused = useRef<HTMLElement | null>(null)

  // 打开：记录焦点 + 滚动锁；关闭：恢复焦点
  useEffect(() => {
    if (!open) return
    lastFocused.current = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.body.style.overflow = prevOverflow
      lastFocused.current?.focus?.()
    }
  }, [open])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

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
          'relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl outline-none dark:bg-shell-surface',
          'motion-safe:animate-scale-in',
          className
        )}
      >
        {(title || showClose) && (
          <div className="mb-4 flex items-center justify-between gap-3">
            {title && (
              <h3 id={titleId} className="text-base font-semibold text-travel-inkStrong dark:text-shell-text">
                {title}
              </h3>
            )}
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="ml-auto rounded-full p-1 text-travel-ink/50 transition hover:bg-travel-sakura/40 hover:text-travel-ink dark:text-shell-muted dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
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
