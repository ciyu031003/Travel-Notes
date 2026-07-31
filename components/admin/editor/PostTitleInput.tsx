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
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">标题</label>
        <input
          type="text"
          value={title}
          onChange={(e) => onChange('title', e.target.value)}
          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="请输入文章标题"
          required
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Calendar className="w-4 h-4 inline mr-2" />
            日期
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => onChange('date', e.target.value)}
            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Slug</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={slug}
              onChange={(e) => onChange('slug', e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="url-slug"
            />
            {onGenerateSlug && (
              <button
                type="button"
                onClick={onGenerateSlug}
                className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
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
