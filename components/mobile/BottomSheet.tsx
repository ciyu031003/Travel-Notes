'use client'

import { useEffect, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion, useDragControls } from 'motion/react'
import { X } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { useCloseOnBack } from '@/hooks/use-close-on-back'
import { cn } from '@/lib/utils'

/**
 * 底部抽屉 2.0（iOS 手感）：
 * - 把手/标题栏跟手拖拽：dragListener 关闭、仅从把手热区与标题栏起拖，
 *   内容区滚动不受拖拽干扰；
 * - 下拉过半（>120px）或快速一甩（>500px/s）→ 关闭；不足 → 弹簧回弹；
 * - 进出场统一弹簧（AnimatePresence），关闭不再"瞬间消失"；
 * - MotionConfig reducedMotion="user"：系统减动效时 transform 直切、仅保留淡入淡出。
 */
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
  const dragControls = useDragControls()

  // Android 物理返回 / 浏览器返回：先关面板而不是离开页面（不可关闭面板不接管）
  useCloseOnBack(open, onClose, dismissible)

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

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dismissible) return
    // 点到头部里的按钮（关闭键）时不进入拖拽，保证点击行为
    if ((event.target as HTMLElement).closest('button')) return
    dragControls.start(event)
  }

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[95]">
            <motion.button
              type="button"
              aria-label="关闭面板"
              tabIndex={-1}
              onClick={() => {
                if (dismissible) onClose()
              }}
              className="m-sheet-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={title || '底部面板'}
              className={cn('m-sheet', className)}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 44 }}
              drag={dismissible ? 'y' : false}
              dragListener={false}
              dragControls={dragControls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.02, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 120 || info.velocity.y > 500) onClose()
              }}
            >
              <div aria-hidden="true" className="m-sheet-grabber-zone" onPointerDown={startDrag}>
                <span className="m-sheet-grabber" />
              </div>
              {title && (
                <div className="m-sheet-head" onPointerDown={startDrag}>
                  <h2 className="m-title-2 font-semibold text-[var(--m-text)]">{title}</h2>
                  {dismissible && (
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="关闭"
                      className="m-sheet-close"
                    >
                      <Icon icon={X} size="md" />
                    </button>
                  )}
                </div>
              )}
              <div className="m-sheet-body">{children}</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
