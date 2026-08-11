'use client'

import { FileText } from 'lucide-react'

export interface MarkdownEditorProps {
  content: string
  onChange: (content: string) => void
}

function countWords(text: string): { chars: number; words: number } {
  const stripped = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')
  const chinese = (stripped.match(/[\u4e00-\u9fa5]/g) || []).length
  const english = stripped
    .replace(/[\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
  return { chars: stripped.replace(/\s/g, '').length, words: chinese + english }
}

export default function MarkdownEditor({ content, onChange }: MarkdownEditorProps) {
  const { chars, words } = countWords(content)
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        <FileText className="w-4 h-4 inline mr-2" />
        正文内容 (支持 Markdown)
      </label>
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        rows={20}
        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        placeholder="在这里书写你的 Markdown 内容..."
        required
      />
      <div className="mt-2 text-xs text-gray-400 text-right">
        {chars} 字 · 约 {words} 词 · <span className="text-gray-300 dark:text-gray-500">Ctrl/⌘ + S 保存</span>
      </div>
    </div>
  )
}

