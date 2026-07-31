'use client'

import { useEffect, useId, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { cn } from '@/lib/utils'

interface MermaidMindmapProps {
  content: string
  className?: string
}

// 匹配 ```mermaid ... ``` 代码块
const MERMAID_BLOCK_RE = /```mermaid\n([\s\S]*?)```/g

/**
 * 从 Markdown 内容中提取所有 mermaid 代码块；
 * 若没有则将整段内容视为单个 mermaid 源码（兼容旧文章）。
 */
function extractMermaidSources(content: string): string[] {
  if (!content) return []
  const sources: string[] = []
  let match: RegExpExecArray | null
  // 重置 lastIndex，避免全局正则复用导致的状态泄漏
  MERMAID_BLOCK_RE.lastIndex = 0
  while ((match = MERMAID_BLOCK_RE.exec(content)) !== null) {
    const code = match[1]?.trim()
    if (code) sources.push(code)
  }
  if (sources.length === 0) {
    const trimmed = content.trim()
    if (trimmed) sources.push(trimmed)
  }
  return sources
}

/**
 * Mermaid 兼容渲染器：保留旧文章 front-matter 里 renderer: mermaid 的渲染路径。
 * 用唯一 id（useId）确保多实例隔离，并用 initialized 守卫避免重复初始化。
 */
export default function MermaidMindmap({ content, className }: MermaidMindmapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const reactId = useId()
  // 去除 useId 生成的冒号（DOM id 不允许）
  const scopeId = `mm-mermaid-${reactId.replace(/[:]/g, '')}`
  const [initialized, setInitialized] = useState(false)
  const [sources] = useState(() => extractMermaidSources(content))

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
    })
    setInitialized(true)
  }, [])

  useEffect(() => {
    if (!initialized || !containerRef.current) return
    let cancelled = false

    async function renderAll() {
      const container = containerRef.current
      if (!container) return
      // 清空旧内容，避免重复渲染
      container.innerHTML = ''
      for (let i = 0; i < sources.length; i++) {
        const code = sources[i]
        const id = `${scopeId}-${i}`
        try {
          const { svg } = await mermaid.render(id, code)
          if (cancelled) return
          const wrapper = document.createElement('div')
          wrapper.className = 'flex justify-center my-4'
          wrapper.innerHTML = svg
          container.appendChild(wrapper)
        } catch (err) {
          if (cancelled) return
          const errDiv = document.createElement('div')
          errDiv.className =
            'text-sm text-rose-500 bg-rose-50 dark:bg-rose-900/20 rounded-lg p-3 my-2'
          errDiv.textContent = `Mermaid 渲染失败：${err instanceof Error ? err.message : String(err)}`
          container.appendChild(errDiv)
        }
      }
    }

    void renderAll()
    return () => {
      cancelled = true
    }
  }, [initialized, sources, scopeId])

  return (
    <div
      className={cn(
        'w-full min-h-[400px] bg-white dark:bg-gray-900 rounded-xl border border-rose-100 dark:border-rose-900/40 overflow-hidden p-4',
        className,
      )}
    >
      {sources.length === 0 ? (
        <div className="flex items-center justify-center h-[400px] text-sm text-gray-400">
          暂无可渲染的 Mermaid 内容
        </div>
      ) : (
        <div ref={containerRef} className="prose prose-lg dark:prose-invert max-w-none" />
      )}
    </div>
  )
}
