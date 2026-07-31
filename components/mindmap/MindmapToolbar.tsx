'use client'

import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Expand,
  Download,
  Shrink,
} from 'lucide-react'

interface MindmapToolbarProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onFit: () => void
  onFullscreen: () => void
  onExportPng?: () => void
  isFullscreen?: boolean
}

interface ToolButtonProps {
  label: string
  onClick: () => void
  children: React.ReactNode
}

function ToolButton({ label, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="group relative p-2 rounded-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur hover:bg-purple-50 dark:hover:bg-purple-900/30 text-gray-600 dark:text-gray-300 hover:text-purple-500 dark:hover:text-purple-300 transition-colors shadow-sm overflow-hidden"
    >
      {/* 悬停时的丝带光效 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-purple-200/40 to-transparent"
      />
      <span className="relative block">{children}</span>
    </button>
  )
}

/**
 * 顶部浮动工具栏：放大/缩小/重置/适应/全屏/导出 PNG。
 * 通过回调与 MindmapViewer 解耦，按钮本身不持有状态。
 */
export default function MindmapToolbar({
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
  onFullscreen,
  onExportPng,
  isFullscreen = false,
}: MindmapToolbarProps) {
  return (
    <div className="absolute top-3 right-3 z-10 flex gap-1">
      <ToolButton label="放大" onClick={onZoomIn}>
        <ZoomIn className="w-4 h-4" />
      </ToolButton>
      <ToolButton label="缩小" onClick={onZoomOut}>
        <ZoomOut className="w-4 h-4" />
      </ToolButton>
      <ToolButton label="重置视图" onClick={onReset}>
        <RotateCcw className="w-4 h-4" />
      </ToolButton>
      <ToolButton label="适应窗口" onClick={onFit}>
        <Maximize2 className="w-4 h-4" />
      </ToolButton>
      {onExportPng && (
        <ToolButton label="导出 PNG" onClick={onExportPng}>
          <Download className="w-4 h-4" />
        </ToolButton>
      )}
      <ToolButton label={isFullscreen ? '退出全屏' : '全屏'} onClick={onFullscreen}>
        {isFullscreen ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
      </ToolButton>
    </div>
  )
}
