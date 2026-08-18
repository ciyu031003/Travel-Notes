'use client'

import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Map, Minus, Plus, RotateCcw, Sparkles } from 'lucide-react'
import type { CityData } from './particlePhoto'

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
      {/* 顶部玻璃栏 */}
      <header className="absolute top-0 inset-x-0 z-30 flex items-center justify-between gap-3 px-3 sm:px-5 py-3 space-glass rounded-none border-x-0 border-t-0">
        <div className="flex items-center gap-3 min-w-0">
          <a
            href="/login"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full space-glass-btn text-album-text1 text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            返回
          </a>
          <div className="hidden sm:flex items-center gap-2 min-w-0">
            <BookOpen className="w-4 h-4 text-album-accent shrink-0" />
            <h1 className="text-album-text1 text-sm font-semibold tracking-widest truncate">
              我们的旅行相册 · 银河存档
            </h1>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs text-album-text2 select-none">
          <Sparkles className="w-3.5 h-3.5 text-album-accent" />
          <span>{cities.length} 座城市 · {totalPhotos} 张照片</span>
        </div>

        <button
          type="button"
          onClick={onTogglePixel}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full space-glass-btn text-album-text1 text-xs font-bold"
          title="一键切换到复古像素风"
        >
          <Map className="w-3.5 h-3.5" />
          像素风
        </button>
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
            <ChevronLeft className="w-4 h-4" />
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
            <ChevronRight className="w-4 h-4" />
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
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            className="space-glass-btn w-9 h-9 rounded-full flex items-center justify-center text-album-text1 shrink-0"
            aria-label="放大"
          >
            <Plus className="w-4 h-4" />
          </button>

          {closeup && (
            <button
              type="button"
              onClick={onExitCloseup}
              className="space-glass-btn rounded-full px-3 h-9 flex items-center gap-1.5 text-album-accentStrong text-xs font-bold shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              返回银河
            </button>
          )}
        </div>
      </div>
    </>
  )
}


