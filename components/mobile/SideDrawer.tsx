'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { X } from 'lucide-react'
import { useModalLayer } from '@/hooks/use-modal-layer'
import { cn } from '@/lib/utils'
import { MOBILE_OVERLAY_TRANSITION, MOBILE_PANEL_SPRING } from '@/lib/mobile/motion'
import { Icon } from './Icon'
import { IconButton } from './IconButton'

export function SideDrawer({
  open,
  onClose,
  title,
  children,
  className,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
  /** 固定在底部的操作区，例如“退出登录”。 */
  footer?: ReactNode
}) {
  const panelRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useModalLayer({ open: open && mounted, onClose, panelRef })

  if (!mounted) return null

  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[115]" data-modal-layer="side-drawer">
            <motion.button
              type="button"
              aria-label="关闭侧边面板"
              tabIndex={-1}
              onClick={onClose}
              className="m-drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={MOBILE_OVERLAY_TRANSITION}
            />
            <motion.aside
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className={cn('m-drawer-panel', className)}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={MOBILE_PANEL_SPRING}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0, right: 0.55 }}
              onDragEnd={(_, info) => {
                if (info.offset.x > 90 || info.velocity.x > 500) onClose()
              }}
            >
              <header
                className="flex items-center gap-2 px-4 pb-2"
                style={{ paddingTop: 'var(--m-safe-top)' }}
              >
                <h2 id={titleId} className="m-title-2 min-w-0 flex-1 truncate text-[var(--m-text)]">
                  {title}
                </h2>
                <IconButton icon={X} label="关闭" variant="plain" onClick={onClose} />
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>

              {footer && (
                <div
                  className="border-t border-[var(--m-line)] px-4 pt-3"
                  style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
                >
                  {footer}
                </div>
              )}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </MotionConfig>,
    document.body,
  )
}

/** 抽屉里的分组：比页面级列表更紧凑。 */
export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-2">
      <p className="m-label mb-2 px-1 text-[var(--m-faint)]">{title}</p>
      <div className="m-card-flat overflow-hidden divide-y divide-[var(--m-line)]">{children}</div>
    </section>
  )
}

/** 抽屉行：图标 + 标题 + 可选说明与尾部内容。 */
export function DrawerRow({
  icon,
  title,
  description,
  trailing,
  onClick,
  href,
}: {
  icon: React.ComponentType<{ size?: 'sm' | 'md' | 'lg'; className?: string }>
  title: string
  description?: string
  trailing?: ReactNode
  onClick?: () => void
  href?: string
}) {
  const body = (
    <>
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[var(--m-surface-2)] text-[var(--m-muted)]">
        <Icon icon={icon as never} size="sm" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="m-body block truncate font-medium text-[var(--m-text)]">{title}</span>
        {description && (
          <span className="m-caption mt-0.5 block truncate text-[var(--m-muted)]">
            {description}
          </span>
        )}
      </span>
      {trailing}
    </>
  )
  const cls = 'm-pressable flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left'
  if (href) {
    return (
      <Link href={href} className={cls} onClick={onClick}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  )
}

export default SideDrawer
