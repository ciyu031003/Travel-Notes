'use client'

import { useState, useEffect, useRef } from 'react'
import MermaidRenderer from '@/components/mdx/MermaidRenderer'

export interface MarkdownPreviewProps {
  content: string
}

export default function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }

    if (!content.trim()) {
      setHtml('')
      return
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/admin/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        })
        if (res.ok) {
          const data = await res.json()
          setHtml(data.data?.html || data.html || '')
        }
      } catch {
        // ignore preview errors
      } finally {
        setLoading(false)
      }
    }, 500)

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [content])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
        实时预览
        {loading && (
          <span className="ml-2 text-xs text-gray-500">(渲染中...)</span>
        )}
      </div>
      <div className="prose prose-lg dark:prose-invert max-w-none">
        {loading && !html ? (
          <div className="text-gray-400 text-center py-8">正在渲染预览...</div>
        ) : html ? (
          <>
            <div dangerouslySetInnerHTML={{ __html: html }} />
            <MermaidRenderer />
          </>
        ) : (
          <div className="text-gray-400 text-center py-8">暂无内容</div>
        )}
      </div>
    </div>
  )
}
