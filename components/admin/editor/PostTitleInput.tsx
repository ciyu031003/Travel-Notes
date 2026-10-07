'use client'

import { Calendar } from 'lucide-react'

export interface PostTitleInputProps {
  title: string
  slug: string
  date: string
  onChange: (field: string, value: any) => void
  onGenerateSlug?: () => void
}

export default function PostTitleInput({
  title,
  slug,
  date,
  onChange,
  onGenerateSlug,
}: PostTitleInputProps) {
  return (
    <>
      <div className="bg-white dark:bg-warm-800 rounded-xl shadow-sm p-6">
        <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">标题</label>
        <input
          type="text"
          value={title}
          onChange={(e) => onChange('title', e.target.value)}
          className="w-full px-4 py-3 bg-warm-50 dark:bg-warm-700 border border-warm-300 dark:border-warm-600 rounded-lg text-warm-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="请输入文章标题"
          required
        />
      </div>

      <div className="bg-white dark:bg-warm-800 rounded-xl shadow-sm p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
            <Calendar className="w-4 h-4 inline mr-2" />
            日期
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => onChange('date', e.target.value)}
            className="w-full px-4 py-2 bg-warm-50 dark:bg-warm-700 border border-warm-300 dark:border-warm-600 rounded-lg text-warm-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">Slug</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={slug}
              onChange={(e) => onChange('slug', e.target.value)}
              className="flex-1 px-3 py-2 bg-warm-50 dark:bg-warm-700 border border-warm-300 dark:border-warm-600 rounded-lg text-warm-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="url-slug"
            />
            {onGenerateSlug && (
              <button
                type="button"
                onClick={onGenerateSlug}
                className="px-3 py-2 text-xs text-warm-600 dark:text-warm-300 bg-warm-100 dark:bg-warm-700 hover:bg-warm-200 dark:hover:bg-warm-600 rounded-lg"
              >
                生成
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
