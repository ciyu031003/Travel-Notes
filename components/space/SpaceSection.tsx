import Link from 'next/link'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/mobile/Icon'
import { ChevronRight } from '@/lib/mobile/icon-system'

/**
 * 空间详情的区块骨架（S2 重构新增）。
 *
 * 为什么单独抽出来：详情页有五个区块，标题行/间距/空态如果各写一遍，
 * 一行改动就得同步五处，最后必然出现「旅行区标题 15px、相册区 14px」这类漂移。
 * 这里把「标题克制 + 留白干净」固化成一套结构：
 *   · 标题 16px/600，右侧只允许一个次要动作（「全部」链接或「管理」按钮）；
 *   · 区块之间统一 32px（--m-section-gap 的等比档），区块内部 12px；
 *   · 空态 = 一行文案 + 可选 CTA，不写长解释（规范：空态给出口，不给说明书）。
 *
 * 视觉纪律：标题/正文用中性层（--ui-social-*），只有 CTA 用空间主题色
 * （--ui-space-accent-strong）。彩色面积留给 Hero 与封面，页面才显得安静。
 */
export function SpaceSection({
  title,
  meta,
  action,
  children,
  className,
}: {
  title: string
  /** 标题右侧的极轻量数字（如「3 段」），不参与强调 */
  meta?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('mt-8', className)}>
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-[16px] font-semibold leading-6 tracking-[-0.01em] text-[var(--ui-social-text)]">
            {title}
          </h2>
          {meta ? (
            <span className="flex-none text-[11px] tabular-nums text-[var(--ui-social-faint)]">{meta}</span>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** 区块右上角的「全部 / 管理」入口：13px，主题色，带一个箭头 */
export function SpaceSectionLink({
  href,
  children = '全部',
}: {
  href: string
  children?: ReactNode
}) {
  return (
    <Link
      href={href}
      className="m-pressable inline-flex flex-none items-center gap-0.5 text-[13px] font-medium text-[var(--ui-space-accent-strong)]"
    >
      {children}
      <Icon icon={ChevronRight} size="sm" />
    </Link>
  )
}

/**
 * 空态：一行文案 + 一个出口。
 *
 * 刻意用虚线描边（而不是实心卡片）：空态不该抢已经有内容的区块的视觉重量。
 * CTA 只给有编辑权限的人（VIEWER 看到的是纯提示）。
 */
export function SpaceEmpty({
  icon,
  text,
  cta,
}: {
  icon: LucideIcon
  text: string
  cta?: { href: string; label: string }
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-dashed border-[var(--ui-social-line)] px-4 py-4">
      <Icon icon={icon} size="sm" className="flex-none text-[var(--ui-social-faint)]" />
      <p className="min-w-0 flex-1 text-[13px] leading-5 text-[var(--ui-social-muted)]">{text}</p>
      {cta ? (
        <Link
          href={cta.href}
          className="m-pressable flex-none text-[13px] font-medium text-[var(--ui-space-accent-strong)]"
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  )
}
