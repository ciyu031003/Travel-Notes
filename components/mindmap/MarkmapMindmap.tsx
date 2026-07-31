'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import { Transformer } from 'markmap-lib'
import { Markmap, type Markmap as MarkmapInstance } from 'markmap-view'
import { cn } from '@/lib/utils'

/**
 * 通过 forwardRef 暴露给父组件（MindmapViewer）的命令式 API。
 * MindmapViewer 的工具栏调用这些方法实现缩放/重置/适应/导出。
 */
export interface MarkmapMindmapHandle {
  /** 放大（基于当前缩放比例 × 1.2） */
  zoomIn: () => void
  /** 缩小（基于当前缩放比例 ÷ 1.2） */
  zoomOut: () => void
  /** 重置视图（适应内容） */
  reset: () => void
  /** 适应视口 */
  fit: () => void
  /** 导出当前 SVG 为 PNG 并触发下载 */
  exportPng: (fileName?: string) => void
  /** 获取底层 Markmap 实例（供高级用法） */
  getMarkmap: () => MarkmapInstance | null
}

interface MarkmapMindmapProps {
  content: string
  className?: string
}

// markmap-lib 的 Transformer 是无状态的，复用单例避免每次渲染重建 markdown-it 实例
const transformer = new Transformer()

// 缩放档位：每次放大/缩小 20%
const ZOOM_STEP = 1.2

// 工具栏按钮触发的视图刷新辅助：读取 d3-zoom 在 SVG 上存储的当前缩放值
function getCurrentScale(svg: SVGSVGElement | null): number {
  if (!svg) return 1
  // d3-zoom 将 transform 挂载在 DOM 节点的 __zoom 属性上
  const k = (svg as unknown as { __zoom?: { k?: number } }).__zoom?.k
  return typeof k === 'number' && k > 0 ? k : 1
}

/**
 * 核心渲染器：用 markmap-lib 将 Markdown 标题层级转为 markmap JSON，
 * 再用 markmap-view（基于 d3）渲染为可交互 SVG（节点折叠/展开/缩放/平移）。
 */
const MarkmapMindmap = forwardRef<MarkmapMindmapHandle, MarkmapMindmapProps>(
  function MarkmapMindmap({ content, className }, ref) {
    const svgRef = useRef<SVGSVGElement | null>(null)
    const mmRef = useRef<MarkmapInstance | null>(null)

    useEffect(() => {
      if (!svgRef.current) return

      // 首次挂载：创建 Markmap 实例并注入初始数据
      const { root } = transformer.transform(content || '')
      const mm = Markmap.create(
        svgRef.current,
        {
          autoFit: true,
          duration: 300,
          maxWidth: 300,
          spacingHorizontal: 80,
          spacingVertical: 16,
          paddingX: 8,
          initialExpandLevel: -1,
          zoom: true,
          pan: true,
        },
        root,
      )
      mmRef.current = mm

      return () => {
        mm.destroy()
        mmRef.current = null
      }
      // 仅在挂载时创建实例；content 变化由下面的 effect 处理
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
      const mm = mmRef.current
      if (!mm) return
      // content 变化时更新数据（不重建实例，保留视图状态）
      const { root } = transformer.transform(content || '')
      mm.setData(root)
    }, [content])

    useImperativeHandle(ref, () => ({
      zoomIn: () => {
        const mm = mmRef.current
        if (!mm) return
        const current = getCurrentScale(svgRef.current)
        void mm.rescale(current * ZOOM_STEP)
      },
      zoomOut: () => {
        const mm = mmRef.current
        if (!mm) return
        const current = getCurrentScale(svgRef.current)
        void mm.rescale(current / ZOOM_STEP)
      },
      reset: () => {
        const mm = mmRef.current
        if (!mm) return
        void mm.fit()
      },
      fit: () => {
        const mm = mmRef.current
        if (!mm) return
        void mm.fit()
      },
      exportPng: (fileName?: string) => {
        const svg = svgRef.current
        if (!svg) return
        const rect = svg.getBoundingClientRect()
        const width = Math.max(rect.width, 800)
        const height = Math.max(rect.height, 600)

        // 序列化 SVG（markmap-view 默认 embedGlobalCSS，样式已内联在 <style> 中）
        const xmlSerializer = new XMLSerializer()
        const svgString = xmlSerializer.serializeToString(svg)
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(svgBlob)

        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const canvas = document.createElement('canvas')
          // 2x 用于提升清晰度
          canvas.width = width * 2
          canvas.height = height * 2
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            URL.revokeObjectURL(url)
            return
          }
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          URL.revokeObjectURL(url)
          canvas.toBlob((blob) => {
            if (!blob) return
            const link = document.createElement('a')
            link.href = URL.createObjectURL(blob)
            link.download = `${fileName || 'mindmap'}.png`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(link.href)
          }, 'image/png')
        }
        img.onerror = () => URL.revokeObjectURL(url)
        img.src = url
      },
      getMarkmap: () => mmRef.current,
    }), [])

    return (
      <div
        className={cn(
          'w-full h-[600px] bg-white dark:bg-gray-900 rounded-xl border border-purple-100 dark:border-purple-900/40 overflow-hidden',
          className,
        )}
      >
        <svg ref={svgRef} className="w-full h-full" />
      </div>
    )
  },
)

export default MarkmapMindmap
