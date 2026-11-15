'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Lock, MapPin, Menu, Orbit, Rocket, Settings2 } from '@/lib/mobile/icon-system'
import ManageEntry from '@/components/layout/ManageEntry'
import { Icon } from '@/components/mobile/Icon'
import AlbumModeSwitch, { type AlbumViewMode } from './AlbumModeSwitch'

/**
 * 像素模式顶部导航 + 桌面/移动两套操作组（P2-32 拆分自 app/album/page.tsx）。
 *
 * 移动端此前缺少「切银河」入口（真实可用性缺陷），所以模式按钮在移动端也必须可见；
 * 星图/管理/进入地图/重新锁定按原样分别放在「桌面完整操作组」和「移动更多菜单」里。
 */
export default function AlbumHeader({
  viewMode,
  onSelectMode,
  onToggleViewMode,
  onOpenStarMap,
}: {
  viewMode: AlbumViewMode
  onSelectMode: (mode: AlbumViewMode) => void
  onToggleViewMode: () => void
  onOpenStarMap: () => void
}) {
  const [showMoreMenu, setShowMoreMenu] = useState(false)

return (
    <header className="m2-gutter sticky top-0 z-40 border-b border-[var(--m-line)] bg-[color-mix(in_srgb,var(--m-bg)_90%,transparent)] pb-2 pt-[max(10px,env(safe-area-inset-top))] backdrop-blur-xl">
      <div className="flex items-center gap-2.5">
        <Link
          href="/"
          aria-label="返回首页"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--m-line)] bg-[var(--m-surface-solid)] text-[var(--m-text)] shadow-[var(--m-shadow-l1)] transition active:scale-95"
        >
          <Icon icon={ArrowLeft} size="md" />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="m2-eyebrow">TRAVEL ALBUM</p>
          <h1 className="mt-0.5 truncate text-[20px] font-bold tracking-[-0.02em] text-[var(--m-text)]">旅行相册</h1>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <AlbumModeSwitch viewMode={viewMode} onSelect={onSelectMode} />

          {/* 桌面/移动统一：星图是相册的高频动作，不再埋进二级菜单 */}
          <button
            type="button"
            onClick={onOpenStarMap}
            aria-label="查看旅行星图"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--m-line)] bg-[var(--m-surface-solid)] text-[var(--m-accent-strong)] shadow-[var(--m-shadow-l1)] transition active:scale-95"
          >
            <Icon icon={Orbit} size="sm" />
          </button>

          <button
            type="button"
            onClick={() => setShowMoreMenu((v) => !v)}
            aria-label="更多操作"
            aria-expanded={showMoreMenu}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--m-line)] bg-[var(--m-surface-solid)] text-[var(--m-text)] shadow-[var(--m-shadow-l1)] transition active:scale-95"
          >
            <Icon icon={Menu} size="sm" />
          </button>
        </div>

        {showMoreMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
            <div className="m2-card absolute right-[18px] top-full z-50 mt-2 w-52 overflow-hidden bg-[var(--m-surface-solid)] p-1.5">
              <ManageEntry
                href="/admin/albums"
                label="管理相册"
                icon={<Icon icon={Settings2} size="sm" />}
                className="m2-list-row w-full justify-start rounded-[10px] px-3 py-2 text-left text-[13px] font-semibold text-[var(--m-text)]"
              />
              <button
                type="button"
                onClick={() => {
                  onOpenStarMap()
                  setShowMoreMenu(false)
                }}
                className="m2-list-row w-full justify-start rounded-[10px] px-3 py-2 text-left text-[13px] font-semibold text-[var(--m-text)]"
              >
                <Icon icon={Orbit} size="sm" />
                旅行星图
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleViewMode()
                  setShowMoreMenu(false)
                }}
                className="m2-list-row w-full justify-start rounded-[10px] px-3 py-2 text-left text-[13px] font-semibold text-[var(--m-text)]"
              >
                <Icon icon={Rocket} size="sm" />
                切换银河模式
              </button>
              <Link
                href="/"
                onClick={() => setShowMoreMenu(false)}
                className="m2-list-row w-full justify-start rounded-[10px] px-3 py-2 text-left text-[13px] font-semibold text-[var(--m-text)]"
              >
                <Icon icon={MapPin} size="sm" />
                进入地图
              </Link>
              <button
                type="button"
                onClick={() => {
                  // 清除相册解锁 cookie 并刷新，回到上锁态（原「返回登录」入口的正规语义）
                  document.cookie = 'album_token=; Max-Age=0; path=/'
                  window.location.reload()
                }}
                className="m2-list-row w-full justify-start rounded-[10px] px-3 py-2 text-left text-[13px] font-semibold text-[var(--m-danger)]"
              >
                <Icon icon={Lock} size="sm" />
                重新锁定相册
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
