'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hapticLight } from '@/lib/mobile/haptics'
import type { IconTone } from '@/lib/mobile/icon-system'
import { Icon } from './Icon'

/**
 * 统计块 —— 统一「数字 + 单位 + 说明」的表达。
 *
 * 替代重构前首页 / 旅行页 / 数据看板各自手写一遍的统计结构
 * （字号 3xl / 34px 混排、单位用 pb-1 手动对齐）。
 * 数字统一走 .m-stat（tabular-nums），消除切换数据时的宽度跳动。
 */

export function StatBlock({
  value,
  unit,
  label,
  icon,
  tone = 'accent',
  href,
  className,
}: {
  value: number | string
  /** 单位，如「个省份」「篇旅行」 */
  unit?: string
  /** 说明文字 */
  label?: string
  icon?: LucideIcon
  tone?: IconTone
  href?: string
  className?: string
}) {
  const inner = (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-end gap-1.5">
        <span className="m-stat text-[var(--m-accent-strong)]">{value}</span>
        {unit && (
          <span className="m-caption pb-1 text-[var(--m-muted)]">{unit}</span>
        )}
      </div>
      {label && (
        <span className="m-caption mt-1 flex items-center gap-1 text-[var(--m-muted)]">
          {icon && <Icon icon={icon} size="sm" tone={tone} />}
          {label}
        </span>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} onClick={() => void hapticLight()} className="m-pressable block">
        {inner}
      </Link>
    )
  }
  return inner
}

/** 行内统计串：用于页面副标题（如「12 篇旅途 · 3 个省 · 5 个城市」）
 *  value 允许传 ReactNode，便于沿用 CountUp 数字动画。 */
export function StatRow({
  items,
  className,
}: {
  items: Array<{ value: ReactNode; unit: string }>
  className?: string
}) {
  return (
    <p className={cn('m-caption text-[var(--m-muted)]', className)}>
      {items.map((it, i) => (
        <span key={it.unit}>
          {i > 0 && <span aria-hidden="true" className="mx-1.5 opacity-50">·</span>}
          <span className="font-semibold tabular-nums text-[var(--m-text)]">{it.value}</span>
          <span className="ml-1">{it.unit}</span>
        </span>
      ))}
    </p>
  )
}

export default StatBlock
