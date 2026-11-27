'use client'

import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { SPACE_STAGGER_ITEM, spaceStaggerContainer } from './space-motion'

/**
 * 抽屉内容分组（U1）。
 *
 * 背景：空间设置 / 邀请 / 成员这三个 BottomSheet 之前都是一串 `space-y-4` 的
 * 裸字段，读起来没有结构。U1 把它们按语义分成 2~3 组（外观 / 基本信息 / 邀请方式），
 * 每组一个小标题 + 组内 12px 间距；组与组之间 16px。
 *
 * 动效：抽屉本身由 BottomSheet 负责滑入（transform），这里只让**分组依次淡入上浮**
 * （60ms 错峰），补上"内容跟着抽屉一起进来"的层次；关掉动效时只剩淡入。
 * 注意：不为分组做高度动画（会触发布局），组内的展开/收起另有 .space-disclosure。
 */
export function SpaceSheetGroups({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={cn('space-y-4', className)}
      initial="hidden"
      animate="show"
      variants={spaceStaggerContainer(0.03)}
    >
      {children}
    </motion.div>
  )
}

export function SpaceSheetGroup({
  title,
  hint,
  children,
  className,
}: {
  title: string
  /** 小标题右侧的极轻量说明（如「可选」） */
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <motion.section variants={SPACE_STAGGER_ITEM} className={cn('space-sheet-group', className)}>
      <p className="flex items-baseline gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-[var(--ui-social-muted)]">
        {title}
        {hint ? <span className="font-normal tracking-normal text-[var(--ui-social-faint)]">{hint}</span> : null}
      </p>
      <div className="mt-2 space-y-3">{children}</div>
    </motion.section>
  )
}
