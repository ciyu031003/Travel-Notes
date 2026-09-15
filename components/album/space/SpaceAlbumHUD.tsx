'use client'

import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, Sparkles, Settings2 } from 'lucide-react'
import type { CityData } from './particlePhoto'
import ManageEntry from '@/components/layout/ManageEntry'
import { Icon } from '@/components/mobile/Icon'
import { albumModeOf } from '@/lib/album-modes'

/** 模式文案/图标统一取自 lib/album-modes */
const PIXEL_MODE = albumModeOf('pixel')

interface SpaceAlbumHUDProps {
  cities: CityData[]
  index: number
  hovered: number | null
  closeup: boolean
  onTogglePixel: () => void
  onPrev: () => void
  onNext: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onExitCloseup: () => void
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return dateStr
  }
}

/**
 * 银河模式 HUD：
 * - 顶部玻璃栏：标题 / 城市统计 / 一键切换像素风
 * - 底部胶囊栏：上一张/下一张 + 当前城市 + 缩放 + 操作提示
 */
export default function SpaceAlbumHUD({
  cities,
  index,
  hovered,
  closeup,
  onTogglePixel,
  onPrev,
  onNext,
  onZoomIn,
  onZoomOut,
  onExitCloseup,
}: SpaceAlbumHUDProps) {
  const city = cities[index]
  const hoverCity = hovered !== null ? cities[hovered] : null
  const totalPhotos = cities.reduce((sum, c) => sum + c.images.length, 0)

  return (
    <>
      {/* 顶部玻璃栏：几何与画册/像素模式统一（h-14 · z-40 · px-3 md:px-8），仅皮肤保留玻璃 */}
      <header className="absolute top-0 inset-x-0 z-40 flex h-14 items-center justify-between gap-2 px-3 md:px-8 space-glass rounded-none border-x-0 border-t-0">
        <div className="flex items-center gap-3 min-w-0">
          <a
            href="/"
            aria-label="返回首页"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full space-glass-btn text-album-text1 text-xs"
          >
            <Icon icon={ArrowLeft} size="sm" />
            返回
          </a>
          <div className="flex items-center gap-2 min-w-0">
            <Icon icon={BookOpen} size="sm" className="shrink-0 text-album-accent" />
            <h1 className="text-album-text1 text-sm font-semibold tracking-widest truncate">
              银河相册
            </h1>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs text-album-text2 select-none">
          <Icon icon={Sparkles} size="sm" className="text-album-accent" />
          <span>{cities.length} 座城市 · {totalPhotos} 张照片</span>
        </div>

        <div className="flex items-center gap-2">
          {/* 管理入口低频，移动端收起（与像素模式「管理在更多菜单」一致） */}
          <div className="hidden sm:block">
            <ManageEntry
              href="/admin/albums"
              label="管理相册"
              icon={<Icon icon={Settings2} size="sm" />}
              className="px-3.5 py-1.5 rounded-full space-glass-btn text-album-text1 text-xs font-bold"
            />
          </div>
          <button
            type="button"
            onClick={onTogglePixel}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full space-glass-btn text-album-text1 text-xs font-bold"
            title={PIXEL_MODE.title}
          >
            <Icon icon={PIXEL_MODE.icon} size="sm" />
            {PIXEL_MODE.label}
          </button>
        </div>
      </header>

      {/* 底部胶囊栏 */}
      <div className="absolute bottom-4 inset-x-0 z-30 flex justify-center px-3">
        <div className="space-glass rounded-full flex items-center gap-2 sm:gap-3 pl-2 pr-2 py-2 max-w-full overflow-x-auto mc-scrollbar">
          <button
            type="button"
            onClick={onPrev}
            className="space-glass-btn w-9 h-9 rounded-full flex items-center justify-center text-album-text1 shrink-0"
            aria-label="上一张唱片"
          >
            <Icon icon={ChevronLeft} size="sm" />
          </button>

          <div className="min-w-0 text-center px-1 select-none">
            <p className="text-album-text1 text-sm font-bold truncate max-w-[140px] sm:max-w-[220px]">
              {hoverCity ? `${hoverCity.name} · 预览` : city ? city.name : '银河加载中'}
            </p>
            <p className="text-album-text2 text-xs truncate max-w-[140px] sm:max-w-[220px]">
              {city ? `${formatDate(city.date)} · ${city.images.length} 张照片` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={onNext}
            className="space-glass-btn w-9 h-9 rounded-full flex items-center justify-center text-album-text1 shrink-0"
            aria-label="下一张唱片"
          >
            <Icon icon={ChevronRight} size="sm" />
          </button>

          <div className="hidden lg:flex items-center gap-1.5 px-2 text-xs text-album-text2 select-none whitespace-nowrap">
            <span>拖拽环视</span>
            <span className="text-album-text3">·</span>
            <span>滚轮切换</span>
            <span className="text-album-text3">·</span>
            <span>点击放大</span>
            <span className="text-album-text3">·</span>
            <span>Ctrl+滚轮缩放</span>
          </div>

          <button
            type="button"
            onClick={onZoomOut}
            className="space-glass-btn w-9 h-9 rounded-full flex items-center justify-center text-album-text1 shrink-0"
            aria-label="缩小"
          >
            <Icon icon={Minus} size="sm" />
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            className="space-glass-btn w-9 h-9 rounded-full flex items-center justify-center text-album-text1 shrink-0"
            aria-label="放大"
          >
            <Icon icon={Plus} size="sm" />
          </button>

          {closeup && (
            <button
              type="button"
              onClick={onExitCloseup}
              className="space-glass-btn rounded-full px-3 h-9 flex items-center gap-1.5 text-album-accentStrong text-xs font-bold shrink-0"
            >
              <Icon icon={RotateCcw} size="sm" />
              返回银河
            </button>
          )}
        </div>
      </div>
    </>
  )
}


