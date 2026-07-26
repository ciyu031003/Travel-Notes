'use client'

import { useState, useEffect } from 'react'
import { Copy, Check } from 'lucide-react'

interface CodeViewerProps {
  code: string
  language: string
  filename: string
}

export default function CodeViewer({ code, language, filename }: CodeViewerProps) {
  const [copied, setCopied] = useState(false)
  const [highlightedCode, setHighlightedCode] = useState('')

  useEffect(() => {
    // 简单的语法高亮（生产环境建议使用 shiki 或 prism）
    setHighlightedCode(code)
  }, [code])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const lines = code.split('\n')

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{filename}</span>
          <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
            {language}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-500" />
              已复制
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              复制
            </>
          )}
        </button>
      </div>

      {/* Code Content */}
      <div className="overflow-auto max-h-[600px] bg-gray-50 dark:bg-gray-900">
        <pre className="text-sm">
          <code className="font-mono">
            {lines.map((line, index) => (
              <div key={index} className="flex">
                <span className="select-none text-gray-400 text-right pr-4 pl-4 w-12 flex-shrink-0 border-r border-gray-200 dark:border-gray-800">
                  {index + 1}
                </span>
                <span className="pl-4 text-gray-800 dark:text-gray-200 whitespace-pre">
                  {line || ' '}
                </span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  )
}
