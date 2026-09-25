'use client'

import Link from 'next/link'
import { ChevronRight, Images, MapPin, Camera, Sparkles, Clock } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { Pill } from '@/components/mobile/Pills'
import { cn } from '@/lib/utils'
import { spaceTypeIconOf, spaceTypeLabelOf, spaceRoleLabelOf } from '@/lib/mobile/space-system'
import { SpaceAvatarStack, type SpaceMemberPreview } from './SpaceAvatarStack'

export interface SpaceCardData {
  id: number
  name: string
  slug: string
  description: string | null
  spaceType: string | null
  myRole: string
  memberCount: number
  members?: SpaceMemberPreview[]
  albumCount?: number
  travelCount?: number
  memoryCount?: number
  mediaCount?: number
  updatedAt?: string | null
  /** 自动创建的个人空间：显示「默认」标记，且不引导分享 */
  isDefault?: boolean
}

function relativeTime(iso?: string | null): string {
  if (!iso) return ''
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  const month = Math.floor(day / 30)
  if (month < 12) return `${month} 个月前`
  return `${Math.floor(month / 12)} 年前`
}

/**
 * 空间卡片。
 *
 * 视觉分工（对应《我的空间模块优化方案》§3.7 的彩色面积纪律）：
 *  · 头图渐变承担"一眼分辨类型"的职责，高度固定 88px（≈ 屏高 10%），不承载正文；
 *  · 正文只用中性层；主题色只出现在三个地方 —— 头图、类型徽标、统计数字；
 *  · 卡片不自带实心 CTA（实心 CTA 由页面级按钮承担，一屏最多一个）。
 */
export function SpaceCard({ space, className }: { space: SpaceCardData; className?: string }) {
  const stats: Array<[string, number, typeof Images]> = [
    ['旅行', space.travelCount ?? 0, MapPin],
    ['相册', space.albumCount ?? 0, Images],
    ['回忆', space.memoryCount ?? 0, Sparkles],
    ['照片', space.mediaCount ?? 0, Camera],
  ]

  return (
    <Link
      href={`/space/${space.slug}`}
      className={cn(
        'block overflow-hidden rounded-[var(--m-radius-card)] bg-[var(--social-surface)] ring-1 ring-[var(--social-line)] transition active:scale-[0.995]',
        className,
      )}
    >
      {/* 头图：空间主题渐变的唯一大面积用武之地 */}
      <div className="space-hero relative h-[88px] px-4 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[18px] font-semibold leading-6 text-[var(--space-accent-text)]">
              {space.name}
            </h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[var(--space-accent-text)] opacity-80">
              <Icon icon={spaceTypeIconOf(space.spaceType)} size="sm" />
              {spaceTypeLabelOf(space.spaceType)}
              {space.isDefault ? ' · 默认' : ''}
            </p>
          </div>
          <span className="flex-none rounded-full bg-[var(--social-surface)]/80 px-2.5 py-1 text-[11px] font-semibold text-[var(--space-accent-text)] backdrop-blur">
            {spaceRoleLabelOf(space.myRole)}
          </span>
        </div>
      </div>

      <div className="px-4 pb-4 pt-3">
        <p className="line-clamp-2 min-h-[2.5rem] text-[13px] leading-5 text-[var(--social-muted)]">
          {space.description || '还没有简介，写一句话介绍这个空间吧'}
        </p>

        {/* 统计：数字用主题色（关键数字是规范允许上色的四处之一） */}
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-[12px] bg-[var(--social-surface-60)] py-2 text-center">
              <div className="text-[18px] font-semibold leading-5 tabular-nums text-[var(--space-accent-strong)]">
                {value}
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--social-faint)]">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <SpaceAvatarStack members={space.members || []} max={4} size="sm" />
            <span className="text-[13px] text-[var(--social-muted)]">
              {space.memberCount > 0 ? `${space.memberCount} 位成员` : '还没有其他成员'}
            </span>
          </span>
          <span className="flex items-center gap-1 text-[11px] text-[var(--social-faint)]">
            {space.updatedAt && (
              <>
                <Icon icon={Clock} size="sm" />
                {relativeTime(space.updatedAt)}
              </>
            )}
            <Icon icon={ChevronRight} size="sm" />
          </span>
        </div>
      </div>
    </Link>
  )
}

/** 空间列表的分段标题（复用「我的」页的分隔线样式） */
export function SpaceSectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <h2 className="text-[13px] font-semibold tracking-[0.08em] text-[var(--social-muted)]">
        {title}
        {count !== undefined && <span className="ml-1.5 tabular-nums text-[var(--social-faint)]">{count}</span>}
      </h2>
      <div className="h-px flex-1 bg-[var(--social-line)]" />
    </div>
  )
}

/** 类型徽标（供页面复用，避免各处重复 import space-system） */
export function SpaceTypeTag({ type }: { type?: string | null }) {
  return <Pill icon={spaceTypeIconOf(type)} tone="neutral" size="sm">{spaceTypeLabelOf(type)}</Pill>
}

export default SpaceCard
