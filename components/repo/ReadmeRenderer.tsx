'use client'

import { useState, useEffect } from 'react'
import { FileText } from 'lucide-react'

interface ReadmeRendererProps {
  content: string
  className?: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function fallbackHtml(content: string): string {
  return content
    .split('\n\n')
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

export default function ReadmeRenderer({ content, className }: ReadmeRendererProps) {
  const [html, setHtml] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const render = async () => {
      try {
        const res = await fetch('/api/admin/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          const rendered = data?.data?.html || ''
          if (!cancelled) setHtml(rendered || fallbackHtml(content))
        } else {
          if (!cancelled) setHtml(fallbackHtml(content))
        }
      } catch {
        if (!cancelled) setHtml(fallbackHtml(content))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    render()
    return () => {
      cancelled = true
    }
  }, [content])

  return (
    <div className={`card p-6 ${className || ''}`}>
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-gray-800 dark:text-gray-200">
        <FileText className="w-5 h-5 text-green-500" />
        README.md
      </h3>
      {loading ? (
        <p className="text-gray-500 text-sm">渲染中...</p>
      ) : html ? (
        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{content}</pre>
      )}
    </div>
  )
}
