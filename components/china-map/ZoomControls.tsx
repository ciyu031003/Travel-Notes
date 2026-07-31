'use client'

import { Plus } from 'lucide-react'

interface ZoomControlsProps {
  scale: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

export default function ZoomControls({
  scale,
  onZoomIn,
  onZoomOut,
  onReset,
}: ZoomControlsProps) {
  return (
    <div className="absolute top-4 left-4 flex flex-col gap-2 z-40">
      <div className="flex flex-col gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onZoomIn() }}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-9 h-9 bg-[#FAFBF7]/95 border border-[#D8DDD8] rounded-lg flex items-center justify-center hover:bg-[#F5DCE0]/30 transition-colors shadow-md"
          title="放大"
        >
          <Plus className="w-4 h-4 text-[#5A6670]" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onZoomOut() }}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-9 h-9 bg-[#FAFBF7]/95 border border-[#D8DDD8] rounded-lg flex items-center justify-center hover:bg-[#F5DCE0]/30 transition-colors shadow-md"
          title="缩小"
        >
          <span className="text-lg text-[#5A6670]">-</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onReset() }}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-9 h-9 bg-[#FAFBF7]/95 border border-[#D8DDD8] rounded-lg flex items-center justify-center hover:bg-[#F5DCE0]/30 transition-colors shadow-md"
          title="重置"
        >
          <span className="text-xs text-[#5A6670]">1:1</span>
        </button>
        <div className="px-1 pt-1 text-center text-xs text-[#5A6670]/60 bg-[#FAFBF7]/80 rounded">
          {Math.round(scale * 100)}%
        </div>
      </div>

      {/* 操作提示 - 移到左上角缩放按钮下方 */}
      <div className="text-xs text-[#5A6670]/50 bg-[#FAFBF7]/80 px-3 py-2 rounded-lg backdrop-blur pointer-events-none whitespace-nowrap">
        滚轮缩放 · 拖拽移动
      </div>
    </div>
  )
}
