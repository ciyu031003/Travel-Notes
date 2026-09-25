'use client'

import { useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Icon } from './Icon'
import { IconButton } from './IconButton'

/**
 * 右半屏抽屉（参考圆周旅迹「我的」页右上角 ≡ 的形态）。
 *
 * 为什么单独做一个组件而不是复用 BottomSheet：
 *  ① 从**右侧**滑出、占半屏，露出背景页（表达"这是当前页的附属操作"，不是新页面）；
 *  ② 里面的内容是「入口列表」，需要可滚动 + 顶部标题 + 关闭；
 *  ③ 后续「旅行详情」的编辑入口也要用同一种形态，抽出来避免两处各写一遍。
 *
 * 行为：遮罩点击关闭、Esc 关闭、锁定背景滚动、安全区适配、尊重 prefers-reduced-motion
 * （动效定义在 app/mobile.css 的 .m-drawer-panel / .m-drawer-backdrop）。
 */
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
  /** 固定在底部的操作区（如「退出登录」） */
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[115]">
      {/* 遮罩：点一下关闭（用 button 保证键盘可达） */}
      <button
        type="button"
        aria-label="关闭侧边面板"
        tabIndex={-1}
        onClick={onClose}
        className="m-drawer-backdrop"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('m-drawer-panel', className)}
      >
        <header
          className="flex items-center gap-2 px-4 pb-2"
          style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}
        >
          <h2 className="m-title-2 min-w-0 flex-1 truncate text-[var(--m-text)]">{title}</h2>
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
      </aside>
    </div>
  )
}

/** 抽屉里的分组（与 ListSection 同构，但没有页面级 gutter 与标题缩进） */
export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-2">
      <p className="m-label mb-2 px-1 text-[var(--m-faint)]">{title}</p>
      <div className="m-card-flat overflow-hidden divide-y divide-[var(--m-line)]">{children}</div>
    </section>
  )
}

/** 抽屉里的「一行」：图标 + 标题 + 右侧内容（无 chevron，比 ListRow 更紧凑） */
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
        {description && <span className="m-caption mt-0.5 block truncate text-[var(--m-muted)]">{description}</span>}
      </span>
      {trailing}
    </>
  )
  const cls = 'm-pressable flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left'
  if (href) {
    // 用 next/link：站内跳转走客户端路由（不整页刷新），同时保留真实 <a> 语义
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
