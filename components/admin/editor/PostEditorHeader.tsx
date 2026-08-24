'use client'

import Link from 'next/link'
import { ArrowLeft, Eye, Save } from 'lucide-react'

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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-xl border border-white/70 bg-white/80 px-3.5 py-2 text-sm text-travel-ink shadow-sm backdrop-blur-xl transition-all hover:border-travel-bloom/60 hover:text-travel-accent active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </Link>
        <h1 className="text-xl font-bold text-[#2D3842] dark:text-[#F1EFEA]">
          {isNew ? '新建文章' : '编辑文章'}
        </h1>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onPreview}
          className="inline-flex items-center gap-2 rounded-xl border border-white/70 bg-white/80 px-4 py-2 text-sm text-travel-ink shadow-sm backdrop-blur-xl transition-all hover:border-travel-mist hover:text-[#2E6E8E] active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
        >
          <Eye className="h-4 w-4" />
          预览
        </button>
        <button
          type="submit"
          form="post-form"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-travel-accent to-travel-accentSoft px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-travel-accent/25 transition-all hover:shadow-xl active:scale-95 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {loading ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}
