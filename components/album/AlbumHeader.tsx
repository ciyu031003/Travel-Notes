'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BookOpen, Lock, Menu, Orbit, Rocket, Settings2 } from '@/lib/mobile/icon-system'
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
    <header className="sticky top-0 z-40 h-14 flex items-center justify-between gap-2 px-3 md:px-8 border-b-4 border-black bg-black/45">
      <Link
        href="/"
        className="pixel-btn pixel-border-stone px-3 py-1.5 text-xs font-bold rounded-sm shrink-0"
        aria-label="返回首页"
      >
        <Icon icon={ArrowLeft} size="sm" className="sm:mr-1" />
        <span className="hidden sm:inline">返回</span>
      </Link>
      <div className="font-zpix text-album-accent text-sm font-bold tracking-widest drop-shadow-[2px_2px_0_rgba(0,0,0,0.8)] flex items-center gap-2 min-w-0 truncate">
        <Icon icon={BookOpen} size="sm" className="shrink-0" />
        <span className="truncate">旅行相册<span className="hidden sm:inline"> · 存档</span></span>
      </div>
      <div className="relative flex items-center gap-2 shrink-0">
        <AlbumModeSwitch viewMode={viewMode} onSelect={onSelectMode} />
        {/* 桌面：完整操作组 */}
        <div className="hidden md:flex items-center gap-2">
          <ManageEntry
            href="/admin/albums"
            label="管理相册"
            icon={<Icon icon={Settings2} size="sm" />}
            className="pixel-btn pixel-border-gold px-3 py-1.5 text-xs font-bold rounded-sm"
          />
          <button
            type="button"
            onClick={onOpenStarMap}
            className="pixel-btn pixel-border-gold px-3 py-1.5 text-xs font-bold rounded-sm flex items-center gap-1.5"
            title="查看旅行星图"
          >
            <Icon icon={Orbit} size="sm" />
            星图
          </button>
          <Link
            href="/"
            className="pixel-btn pixel-border-gold px-3 py-1.5 text-xs font-bold rounded-sm"
          >
            进入地图
          </Link>
        </div>
        {/* 移动：更多菜单 */}
        <button
          type="button"
          onClick={() => setShowMoreMenu((v) => !v)}
          className="pixel-btn pixel-border-gold px-3 py-1.5 text-xs font-bold rounded-sm flex items-center gap-1.5 md:hidden"
          title="更多操作"
          aria-expanded={showMoreMenu}
        >
          <Icon icon={Menu} size="sm" />
          更多
        </button>
        {showMoreMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
            <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-sm border border-pixel-line bg-pixel-panel shadow-[0_10px_24px_rgba(0,0,0,0.6)]">
              <div className="p-1">
                <ManageEntry
                  href="/admin/albums"
                  label="管理相册"
                  icon={<Icon icon={Settings2} size="sm" />}
                  className="w-full justify-start rounded-sm px-3 py-2 text-xs font-bold text-album-warm hover:bg-black/40 flex items-center gap-1.5"
                />
                <button
                  type="button"
                  onClick={() => { onOpenStarMap(); setShowMoreMenu(false) }}
                  className="w-full justify-start rounded-sm px-3 py-2 text-xs font-bold text-album-warm hover:bg-black/40 flex items-center gap-1.5"
                >
                  <Icon icon={Orbit} size="sm" />
                  星图
                </button>
                <button
                  type="button"
                  onClick={() => { onToggleViewMode(); setShowMoreMenu(false) }}
                  className="w-full justify-start rounded-sm px-3 py-2 text-xs font-bold text-album-warm hover:bg-black/40 flex items-center gap-1.5"
                >
                  <Icon icon={Rocket} size="sm" />
                  银河风
                </button>
                <Link
                  href="/"
                  onClick={() => setShowMoreMenu(false)}
                  className="w-full justify-start rounded-sm px-3 py-2 text-xs font-bold text-album-warm hover:bg-black/40 flex items-center gap-1.5"
                >
                  进入地图
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    // 清除相册解锁 cookie 并刷新，回到上锁态（原「返回登录」入口的正规语义）
                    document.cookie = 'album_token=; Max-Age=0; path=/'
                    window.location.reload()
                  }}
                  className="w-full justify-start rounded-sm px-3 py-2 text-xs font-bold text-album-warm hover:bg-black/40 flex items-center gap-1.5"
                >
                  <Icon icon={Lock} size="sm" />
                  重新锁定相册
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
