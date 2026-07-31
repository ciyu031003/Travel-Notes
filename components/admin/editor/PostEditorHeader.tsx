'use client'

import Link from 'next/link'
import { ArrowLeft, Home, Eye, Save } from 'lucide-react'

export interface PostEditorHeaderProps {
  isNew: boolean
  onPreview: () => void
  onSave?: () => void
  loading?: boolean
  backHref?: string
}

export default function PostEditorHeader({
  isNew,
  onPreview,
  loading = false,
  backHref = '/admin',
}: PostEditorHeaderProps) {
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回
            </Link>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              {isNew ? '新建文章' : '编辑文章'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              target="_blank"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              <Home className="w-4 h-4" />
              回到首页
            </Link>
            <button
              type="button"
              onClick={onPreview}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              <Eye className="w-4 h-4" />
              预览
            </button>
            <button
              type="submit"
              form="post-form"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
