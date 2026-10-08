'use client'

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, MotionConfig, motion, useDragControls } from 'motion/react'
import { X } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { useModalLayer } from '@/hooks/use-modal-layer'
import { cn } from '@/lib/utils'
import { MOBILE_OVERLAY_TRANSITION, MOBILE_PANEL_SPRING } from '@/lib/mobile/motion'

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
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useModalLayer({ open: open && mounted, onClose, dismissible, panelRef })

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dismissible) return
    // 点到头部里的按钮（关闭键）时不进入拖拽，保证点击行为
    if ((event.target as HTMLElement).closest('button')) return
    dragControls.start(event)
  }

  if (!mounted) return null

  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[95]" data-modal-layer="bottom-sheet">
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
              transition={MOBILE_OVERLAY_TRANSITION}
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              tabIndex={-1}
              aria-label={title || '底部面板'}
              className={cn('m-sheet', className)}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={MOBILE_PANEL_SPRING}
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
    </MotionConfig>,
    document.body,
  )
}
