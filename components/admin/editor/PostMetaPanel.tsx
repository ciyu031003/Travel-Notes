'use client'

import { MapPin, Tag, Image, FileText, Globe2, Lock } from 'lucide-react'

const typeIcons: Record<string, any> = {
  travel: MapPin,
}

const typeLabels: Record<string, string> = {
  travel: '旅行记录',
}

export interface PostMetaPanelProps {
  type: string
  tags: string
  location?: string
  cover?: string
  summary?: string
  published: boolean
  isPublic?: boolean
  imagesCount?: number
  videosCount?: number
  onChange: (field: string, value: any) => void
}

export default function PostMetaPanel({
  type,
  tags,
  location = '',
  cover = '',
  summary = '',
  published,
  isPublic = false,
  imagesCount = 0,
  onChange,
}: PostMetaPanelProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">分类</label>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(typeLabels).map(([key, label]) => {
            const Icon = typeIcons[key]
            return (
              <button
                key={key}
                type="button"
                onClick={() => onChange('type', key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  type === key
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          <Tag className="w-4 h-4 inline mr-2" />
          标签 (用逗号分隔)
        </label>
        <input
          type="text"
          value={tags}
          onChange={(e) => onChange('tags', e.target.value)}
          className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="标签1, 标签2, 标签3"
        />
      </div>

      {type === 'travel' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <MapPin className="w-4 h-4 inline mr-2" />
            地点
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => onChange('location', e.target.value)}
            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="例如：广东广州"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          <Image className="w-4 h-4 inline mr-2" />
          封面图 URL (可选，优先使用上传图片的第一张)
        </label>
        <input
          type="text"
          value={cover}
          onChange={(e) => onChange('cover', e.target.value)}
          className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="https://example.com/image.jpg 或留空使用上传图片"
        />
        {imagesCount > 0 && (
          <p className="mt-1 text-xs text-gray-500">
            当前封面: {cover || '将使用上传的第一张图片'}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          <FileText className="w-4 h-4 inline mr-2" />
          摘要
        </label>
        <textarea
          value={summary}
          onChange={(e) => onChange('summary', e.target.value)}
          rows={3}
          className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="简短描述这篇文章..."
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <input
          type="checkbox"
          id="published"
          checked={published}
          onChange={(e) => onChange('published', e.target.checked)}
          className="w-4 h-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
        />
        <label htmlFor="published" className="text-sm text-gray-700 dark:text-gray-300">
          立即发布
        </label>
      </div>

      <div className="pt-1">
        <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
          {isPublic ? <Globe2 className="w-4 h-4 text-sky-500" /> : <Lock className="w-4 h-4 text-amber-500" />}
          谁可以看
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange('isPublic', false)}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              !isPublic
                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            仅自己可见
          </button>
          <button
            type="button"
            onClick={() => onChange('isPublic', true)}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              isPublic
                ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-700'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <Globe2 className="w-3.5 h-3.5" />
            公开分享
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
          {isPublic
            ? '公开后，所有登录用户都能看到这篇游记（为社交圈做准备）。'
            : '仅你自己可以看到这篇游记，其他用户不可见。'}
        </p>
      </div>
    </div>
  )
}
