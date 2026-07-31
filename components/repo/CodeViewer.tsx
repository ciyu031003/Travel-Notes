'use client'

import { useState, useMemo } from 'react'
import hljs from 'highlight.js'
import { Copy, Check, Download, FileCode, FileText, Braces } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface CodeViewerProps {
  code: string
  language: string
  filename: string
}

const LANGUAGE_ICON_MAP: Record<string, LucideIcon> = {
  javascript: FileCode,
  typescript: FileCode,
  jsx: FileCode,
  tsx: FileCode,
  python: FileCode,
  java: FileCode,
  go: FileCode,
  rust: FileCode,
  c: FileCode,
  cpp: FileCode,
  csharp: FileCode,
  php: FileCode,
  ruby: FileCode,
  swift: FileCode,
  kotlin: FileCode,
  scala: FileCode,
  html: FileCode,
  css: FileCode,
  scss: FileCode,
  less: FileCode,
  bash: FileText,
  shell: FileText,
  sql: FileCode,
  json: Braces,
  yaml: Braces,
  toml: Braces,
  ini: Braces,
  xml: FileCode,
  markdown: FileText,
  plaintext: FileText,
}

function getLanguageIcon(language: string): LucideIcon {
  return LANGUAGE_ICON_MAP[language] || FileCode
}

export default function CodeViewer({ code, language, filename }: CodeViewerProps) {
  const [copied, setCopied] = useState(false)

  const highlightedHtml = useMemo(() => {
    try {
      const lang = language || 'plaintext'
      if (hljs.listLanguages().includes(lang)) {
        return hljs.highlight(code, { language: lang }).value
      }
      return hljs.highlightAuto(code).value
    } catch {
      return code.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c))
    }
  }, [code, language])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 降级：用临时 textarea 兼容旧浏览器
      const textarea = document.createElement('textarea')
      textarea.value = code
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {}
      document.body.removeChild(textarea)
    }
  }

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || 'download.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const lines = code.split('\n')
  const lineNumbers = lines.map((_, i) => i + 1).join('\n')
  const LanguageIcon = getLanguageIcon(language)

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 min-w-0">
          <LanguageIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{filename}</span>
          <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded flex-shrink-0">
            {language}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleDownload}
            className="ribbon-hover relative overflow-hidden flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="下载原始文件"
          >
            <Download className="w-3.5 h-3.5" />
            下载
          </button>
          <button
            onClick={handleCopy}
            className="ribbon-hover relative overflow-hidden flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="复制代码"
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
      </div>

      {/* Code Content */}
      <div className="overflow-auto max-h-[600px] bg-[#0d1119]">
        <div className="flex min-w-full">
          <pre
            aria-hidden="true"
            className="select-none text-right py-3 pl-4 pr-3 m-0 text-gray-500 border-r border-gray-800 font-mono text-sm leading-6 flex-shrink-0"
          >
            {lineNumbers}
          </pre>
          <pre className="py-3 pl-4 pr-4 m-0 overflow-x-auto flex-1 font-mono text-sm leading-6">
            <code
              className={`language-${language} hljs !bg-transparent !p-0`}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </pre>
        </div>
      </div>
    </div>
  )
}
