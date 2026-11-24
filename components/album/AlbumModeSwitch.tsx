'use client'

import { motion, useReducedMotion } from 'motion/react'
import { Icon } from '@/components/mobile/Icon'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { cn } from '@/lib/utils'
import { albumModeOf } from '@/lib/album-modes'

/** 相册三种呈现模式（拆分自 app/album/page.tsx，状态仍由页面持有） */
export type AlbumViewMode = 'book' | 'space' | 'pixel'

/** 模式文案/图标统一取自 lib/album-modes */
const BOOK_MODE = albumModeOf('book')
const SPACE_MODE = albumModeOf('space')

/**
 * 模式切换按钮（P2-32 拆分）
 *
 * 只负责渲染「旅行画册 / 银河」两枚按钮并回调目标模式，模式状态与
 * localStorage 持久化仍在页面里，保证与拆分前的切换行为一致。
 *
 * 1.30.1：删掉了 `variant='to-pixel'` 分支（像素锁屏移除后没有调用方）。
 *
 * 2026-11-24（液态玻璃）：两枚按钮收进一枚 `LiquidGlass` 胶囊；选中态的
 * 玻璃片用 `layoutId` 在两枚按钮之间滑过去（尺寸/位置由按钮自身撑开），
 * 与底部导航、分段控件统一为「玻璃 + 滑动胶囊」语言。行为与可访问性不变。
 */
export default function AlbumModeSwitch({
  viewMode,
  onSelect,
}: {
  viewMode: AlbumViewMode
  onSelect: (mode: AlbumViewMode) => void
}) {
  const bookActive = viewMode === 'book'
  const reduceMotion = useReducedMotion()

  const itemClass = (active: boolean) =>
    cn(
      'relative isolate inline-flex h-10 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold transition-colors active:scale-95',
      active ? 'text-[var(--m-accent-strong)]' : 'text-[var(--m-muted)]',
    )

  const pill = (
    <motion.span
      aria-hidden="true"
      layoutId="album-mode-pill"
      className="absolute inset-0 z-0 rounded-full"
      style={{
        background: 'color-mix(in srgb, var(--m-tone-accent-bg) 90%, transparent)',
        boxShadow: '0 2px 10px -5px color-mix(in srgb, var(--m-accent) 60%, transparent)',
      }}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 480, damping: 38 }}
    />
  )

  return (
    <LiquidGlass
      radius={999}
      bevelDepth={9}
      scale={20}
      aberration={2}
      frost={0.32}
      tint={0.2}
      idleOnly
      className="ring-1 ring-[var(--m-line)]"
      contentClassName="relative flex items-center gap-1 p-1"
    >
      <button
        type="button"
        onClick={() => onSelect('book')}
        className={itemClass(bookActive)}
        title={BOOK_MODE.title}
        aria-current={bookActive ? 'true' : undefined}
      >
        {bookActive && pill}
        <Icon icon={BOOK_MODE.icon} size="sm" />
        <span className="relative z-[1] hidden min-[360px]:inline">{BOOK_MODE.label}</span>
      </button>
      <button
        type="button"
        onClick={() => onSelect(viewMode === 'space' ? 'pixel' : 'space')}
        className={itemClass(!bookActive)}
        title={SPACE_MODE.title}
        aria-current={!bookActive ? 'true' : undefined}
      >
        {!bookActive && pill}
        <Icon icon={SPACE_MODE.icon} size="sm" />
        <span className="relative z-[1] hidden min-[360px]:inline">{SPACE_MODE.label}</span>
      </button>
    </LiquidGlass>
  )
}
