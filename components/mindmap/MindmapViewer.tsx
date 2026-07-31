'use client'

import { useCallback, useRef, useState } from 'react'
import MarkmapMindmap, { type MarkmapMindmapHandle } from './MarkmapMindmap'
import MindmapToolbar from './MindmapToolbar'
import { cn } from '@/lib/utils'

interface MindmapViewerProps {
  content: string
  /** 渲染器类型，默认 markmap。本组件仅处理 markmap；mermaid 由 MindmapAutoSwitch 路由到 MermaidMindmap */
  renderer?: 'markmap' | 'mermaid'
  title?: string
  className?: string
}

/**
 * 思维导图主容器：
 *  - 持有 MarkmapMindmap 的 ref，工具栏按钮通过 ref 调用 zoomIn/zoomOut/reset/fit/exportPng。
 *  - 管理全屏状态（fixed inset-0 覆盖层）。
 *  - 全屏时高度自适应视口，非全屏时固定 600px。
 */
export default function MindmapViewer({
  content,
  title,
  className,
}: MindmapViewerProps) {
  const mmRef = useRef<MarkmapMindmapHandle | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const handleZoomIn = useCallback(() => mmRef.current?.zoomIn(), [])
  const handleZoomOut = useCallback(() => mmRef.current?.zoomOut(), [])
  const handleReset = useCallback(() => mmRef.current?.reset(), [])
  const handleFit = useCallback(() => mmRef.current?.fit(), [])
  const handleExportPng = useCallback(() => {
    mmRef.current?.exportPng(title || 'mindmap')
  }, [title])
  const toggleFullscreen = useCallback(() => setIsFullscreen((v) => !v), [])

  return (
    <div
      className={cn(
        isFullscreen
          ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900 p-8 flex flex-col'
          : 'relative w-full',
        className,
      )}
    >
      {isFullscreen && (
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            {title || '思维导图'}
          </h2>
          <span className="text-xs text-gray-400">按 Esc 或点击右下角图标退出全屏</span>
        </div>
      )}

      <div className={cn('relative', isFullscreen && 'flex-1')}>
        <MindmapToolbar
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleReset}
          onFit={handleFit}
          onFullscreen={toggleFullscreen}
          onExportPng={handleExportPng}
          isFullscreen={isFullscreen}
        />
        <MarkmapMindmap
          ref={mmRef}
          content={content}
          className={isFullscreen ? 'h-full' : undefined}
        />
      </div>

      {isFullscreen && (
        <button
          type="button"
          onClick={toggleFullscreen}
          className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm shadow-lg hover:bg-purple-600 transition-colors"
        >
          退出全屏
        </button>
      )}
    </div>
  )
}
