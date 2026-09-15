'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hapticLight } from '@/lib/mobile/haptics'
import type { BadgeTone } from '@/lib/mobile/icon-system'
import { IconBadge } from './IconBadge'
import { Icon } from './Icon'

/**
 * 列表区块 + 列表行 —— 统一「功能入口」类行的结构。
 *
 * 替代重构前重复手写的 `m-card flex items-center gap-4 p-4`
 * （HomeMobile「更多玩法」、MeHome 入口、画册模式切换等）。
 *
 * 用法：
 *   <ListSection title="更多玩法">
 *     <ListRow icon={CalendarDays} tone="accent" title="时间线" description="按年份回顾每一段旅程" href="/timeline" />
 *     <ListRow icon={ChartColumn} tone="sun" title="数据看板" onClick={...} />
 *   </ListSection>
 */

export function ListSection({
  title,
  action,
  children,
  className,
}: {
  title?: string
  /** 右侧操作（如「全部」链接） */
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('m-gutter', className)}>
      {title && (
        <div className="m-section-title">
          <span>{title}</span>
          {action}
        </div>
      )}
      <div className="m-card-flat overflow-hidden divide-y divide-[var(--m-line)]">{children}</div>
    </section>
  )
}

export function ListRow({
  icon,
  tone = 'accent',
  title,
  description,
  href,
  onClick,
  trailing,
  showChevron = true,
  className,
}: {
  icon: LucideIcon
  tone?: BadgeTone
  title: string
  description?: string
  href?: string
  onClick?: () => void
  /** 右侧自定义内容（替代箭头） */
  trailing?: ReactNode
  showChevron?: boolean
  className?: string
}) {
  const body = (
    <>
      <IconBadge icon={icon} tone={tone} />
      <span className="min-w-0 flex-1">
        <span className="m-body block font-semibold text-[var(--m-text)]">{title}</span>
        {description && (
          <span className="m-caption mt-0.5 block text-[var(--m-muted)]">{description}</span>
        )}
      </span>
      {trailing ?? (showChevron && <Icon icon={ChevronRight} size="sm" tone="faint" />)}
    </>
  )

  const base = 'm-pressable flex min-h-[64px] items-center gap-4 px-4 py-3 text-left'

  if (href) {
    return (
      <Link href={href} onClick={() => void hapticLight()} className={cn(base, className)}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, 'w-full', className)}>
        {body}
      </button>
    )
  }
  return <div className={cn(base, className)}>{body}</div>
}

export default ListRow
