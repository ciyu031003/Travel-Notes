'use client'

import { Plus, LocateFixed } from 'lucide-react'

interface ZoomControlsProps {
  scale: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onLocate: () => void
  located?: boolean
}

export default function ZoomControls({
  scale,
  onZoomIn,
  onZoomOut,
  onReset,
  onLocate,
  located = false,
}: ZoomControlsProps) {
  return (
    <div data-map-overlay className="absolute top-4 left-4 flex flex-col gap-2 z-20">
      <div className="flex flex-col gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onZoomIn() }}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-8 h-8 md:w-9 md:h-9 bg-travel-cream/95 border border-travel-dim rounded-lg flex items-center justify-center hover:bg-travel-sakura/30 transition-colors shadow-md"
          title="放大"
          aria-label="放大"
        >
          <Plus className="w-4 h-4 text-travel-ink" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onZoomOut() }}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-8 h-8 md:w-9 md:h-9 bg-travel-cream/95 border border-travel-dim rounded-lg flex items-center justify-center hover:bg-travel-sakura/30 transition-colors shadow-md"
          title="缩小"
          aria-label="缩小"
        >
          <span className="text-lg text-travel-ink">-</span>
        </button>
        {/* 桌面端：1:1 重置（移动端由定位按钮替代） */}
        <button
          onClick={(e) => { e.stopPropagation(); onReset() }}
          onMouseDown={(e) => e.stopPropagation()}
          className="hidden md:flex w-9 h-9 bg-travel-cream/95 border border-travel-dim rounded-lg items-center justify-center hover:bg-travel-sakura/30 transition-colors shadow-md"
          title="重置"
          aria-label="重置"
        >
          <span className="text-xs text-travel-ink">1:1</span>
        </button>
        {/* 回到旅行位置：聚焦已探索区域（移动端替代 1:1） */}
        <button
          onClick={(e) => { e.stopPropagation(); onLocate() }}
          onMouseDown={(e) => e.stopPropagation()}
          className={`w-8 h-8 md:w-9 md:h-9 bg-travel-cream/95 border rounded-lg flex items-center justify-center transition-colors shadow-md ${
            located
              ? 'border-travel-bloom bg-travel-sakura/40 text-travel-accentStrong'
              : 'border-travel-dim hover:bg-travel-sakura/30 text-travel-ink'
          }`}
          title={located ? '回到全国视图' : '回到旅行位置'}
          aria-label={located ? '回到全国视图' : '回到旅行位置'}
        >
          <LocateFixed className="w-4 h-4" />
        </button>
      </div>

      {/* 桌面端提示：100% + 滚轮说明（移动端隐藏，触摸手势无需提示） */}
      <div className="hidden md:block px-1 pt-1 text-center text-xs text-travel-ink/60 bg-travel-cream/80 rounded">
        {Math.round(scale * 100)}%
      </div>
      <div className="hidden md:block text-xs text-travel-ink/50 bg-travel-cream/80 px-3 py-2 rounded-lg backdrop-blur pointer-events-none whitespace-nowrap">
        滚轮缩放 · 拖拽移动
      </div>
    </div>
  )
}
