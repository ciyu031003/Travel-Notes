'use client'

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
 * 只负责渲染「旅行画册 / 银河」两枚按钮并回调目标模式，模式状态与
 * localStorage 持久化仍在页面里，保证与拆分前的切换行为一致。
 *
 * 1.30.1：删掉了 `variant='to-pixel'` 分支。它只被像素风锁屏用
 * （「切到像素」按钮）；像素锁屏整体移除后该变体没有调用方，留着等于
 * 给已废弃的皮肤留入口。另修正 active 态引用的 `--m-tone-pink`
 * （从未定义，样式静默失效 —— token 门禁第 8 条）为 `--m-tone-accent-bg`。
 */
export default function AlbumModeSwitch({
  viewMode,
  onSelect,
}: {
  viewMode: AlbumViewMode
  onSelect: (mode: AlbumViewMode) => void
}) {
  const itemClass = (active: boolean) =>
    `inline-flex h-10 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold transition active:scale-95 ${
      active
        ? 'bg-[var(--m-tone-accent-bg)] text-[var(--m-accent-strong)]'
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
