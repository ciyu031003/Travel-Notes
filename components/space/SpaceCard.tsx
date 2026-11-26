'use client'

import Link from 'next/link'
import { ChevronRight } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { Pill } from '@/components/mobile/Pills'
import { cn } from '@/lib/utils'
import { spaceTypeIconOf, spaceTypeLabelOf, spaceRoleLabelOf } from '@/lib/mobile/space-system'
import { spaceDetailHref } from '@/lib/routes'
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

/**
 * 空间卡片（2026-11 重构）。
 *
 * 视觉分工：
 *  · 封面（.space-cover）是五套配色的唯一大面积载体，高度 92px，只放
 *    「类型徽标 + 名称」—— 用户扫一眼卡片就知道这是哪类空间；
 *  · 正文只用中性层（--ui-social-*），主题色只出现在封面、徽标、统计数字上，
 *    列表里五张彩色卡片同时出现仍然是一个 App；
 *  · 卡片不自带实心 CTA（实心 CTA 由页面级按钮承担，一屏最多一个）；
 *  · 交互走全局 .m-card-pressable（悬停升一档阴影 / 按下 0.985 弹簧），不自绘。
 */
export function SpaceCard({ space, className }: { space: SpaceCardData; className?: string }) {
  const stats: Array<[number, string]> = [
    [space.travelCount ?? 0, '次旅行'],
    [space.albumCount ?? 0, '本相册'],
  ]

  return (
    <Link
      href={spaceDetailHref(space.slug)}
      className={cn(
        'm-card-pressable space-card group block overflow-hidden rounded-3xl bg-[var(--ui-social-surface)] ring-1 ring-[var(--ui-space-hairline)]',
        className,
      )}
    >
      {/* 封面：类型渐变 + 类型徽标 + 空间名（配色由 SpaceThemeScope 注入的 data-space 决定） */}
      <div className="space-cover space-card-cover flex h-[92px] flex-col justify-between px-4 pb-3 pt-3">
        <div className="flex items-start justify-between gap-2">
          <span className="space-chip">
            <Icon icon={spaceTypeIconOf(space.spaceType)} size="sm" />
            {spaceTypeLabelOf(space.spaceType)}
          </span>
          <span className="space-chip space-chip-quiet">
            {space.isDefault ? '默认' : spaceRoleLabelOf(space.myRole)}
          </span>
        </div>
        <h3 className="truncate text-[18px] font-semibold leading-6 text-[var(--ui-space-accent-text)]">
          {space.name}
        </h3>
      </div>

      <div className="px-4 pb-3.5 pt-3">
        <p className="line-clamp-1 text-[13px] leading-5 text-[var(--ui-social-muted)]">
          {space.description || '还没有简介，写一句话记住它'}
        </p>

        <div className="mt-3 flex items-center justify-between gap-3">
          {/* 统计：数字用类型色（规范允许上色的四处之一），单位用中性层 */}
          <span className="flex min-w-0 items-center gap-2.5">
            {stats.map(([value, label], i) => (
              <span key={label} className="flex items-center gap-2.5">
                {i > 0 && (
                  <span aria-hidden="true" className="h-3 w-px flex-none bg-[var(--ui-social-line)]" />
                )}
                <span className="inline-flex items-baseline gap-1">
                  <span className="text-[15px] font-semibold leading-none tabular-nums text-[var(--ui-space-accent-strong)]">
                    {value}
                  </span>
                  <span className="text-[11px] text-[var(--ui-social-faint)]">{label}</span>
                </span>
              </span>
            ))}
          </span>

          <span className="flex flex-none items-center gap-1.5">
            {(space.members?.length ?? 0) > 0 && (
              <SpaceAvatarStack members={space.members || []} max={3} size="sm" />
            )}
            <span className="text-[11px] tabular-nums text-[var(--ui-social-faint)]">
              {space.memberCount} 位
            </span>
            <Icon icon={ChevronRight} size="sm" className="text-[var(--ui-social-faint)]" />
          </span>
        </div>
      </div>
    </Link>
  )
}

/** 空间列表的分段标题：小字距标题 + 计数胶囊 + 发丝线 */
export function SpaceSectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <h2 className="text-[11px] font-bold tracking-[0.14em] text-[var(--ui-social-muted)]">{title}</h2>
      {count !== undefined && (
        <span className="rounded-full bg-[var(--ui-social-surface2)] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--ui-social-faint)]">
          {count}
        </span>
      )}
      <div className="h-px flex-1 bg-[var(--ui-social-line)]" />
    </div>
  )
}

/** 类型徽标（供页面复用，避免各处重复 import space-system） */
export function SpaceTypeTag({ type }: { type?: string | null }) {
  return <Pill icon={spaceTypeIconOf(type)} tone="neutral" size="sm">{spaceTypeLabelOf(type)}</Pill>
}

export default SpaceCard
