'use client'

import { Rocket } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { albumModeOf } from '@/lib/album-modes'

/** 相册三种呈现模式（拆分自 app/album/page.tsx，状态仍由页面持有） */
export type AlbumViewMode = 'book' | 'space' | 'pixel'

/** 模式文案/图标统一取自 lib/album-modes */
const BOOK_MODE = albumModeOf('book')
const SPACE_MODE = albumModeOf('space')

/**
 * 模式切换按钮（P2-32 拆分）
 *
 * variant:
 * - header：像素模式顶部的「旅行画册 / 银河」两枚按钮（与拆分前 DOM/class 完全一致）；
 * - to-pixel：未解锁的银河页里的「切到像素」按钮。
 *
 * 只负责渲染按钮并回调目标模式，模式状态与 localStorage 持久化仍在页面里，
 * 保证与拆分前的切换行为一致。
 */
export default function AlbumModeSwitch({
  viewMode,
  onSelect,
  variant = 'header',
}: {
  viewMode: AlbumViewMode
  onSelect: (mode: AlbumViewMode) => void
  variant?: 'header' | 'to-pixel'
}) {
  if (variant === 'to-pixel') {
    return (
      <button
        type="button"
        onClick={() => onSelect('pixel')}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-3 text-[11px] font-bold text-[var(--m-accent-strong)] shadow-[var(--m-shadow-l1)]"
      >
        <Icon icon={Rocket} size="sm" />
        切到像素
      </button>
    )
  }

  const itemClass = (active: boolean) =>
    `inline-flex h-10 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold transition active:scale-95 ${
      active
        ? 'bg-[var(--m-tone-pink)] text-[var(--m-accent-strong)]'
        : 'bg-[var(--m-surface-solid)] text-[var(--m-muted)] border border-[var(--m-line)]'
    }`

  return (
    <>
      <button
        type="button"
        onClick={() => onSelect('book')}
        className={itemClass(viewMode === 'book')}
        title={BOOK_MODE.title}
        aria-current={viewMode === 'book' ? 'true' : undefined}
      >
        <Icon icon={BOOK_MODE.icon} size="sm" />
        <span className="hidden min-[360px]:inline">{BOOK_MODE.label}</span>
      </button>
      <button
        type="button"
        onClick={() => onSelect(viewMode === 'space' ? 'pixel' : 'space')}
        className={itemClass(viewMode === 'space')}
        title={SPACE_MODE.title}
        aria-current={viewMode === 'space' ? 'true' : undefined}
      >
        <Icon icon={SPACE_MODE.icon} size="sm" />
        <span className="hidden min-[360px]:inline">{SPACE_MODE.label}</span>
      </button>
    </>
  )
}
