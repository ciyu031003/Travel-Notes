'use client'

import { FileText } from 'lucide-react'

export interface MarkdownEditorProps {
  content: string
  onChange: (content: string) => void
}

export default function MarkdownEditor({ content, onChange }: MarkdownEditorProps) {
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
    </div>
  )
}
