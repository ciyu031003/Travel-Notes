'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Calendar, Tag, X } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface BlogPost {
  slug: string
  title: string
  date: string
  description?: string
  cover?: string
  tags?: string[]
  category?: string
  type?: string
}

interface BlogListWithFilterProps {
  posts: BlogPost[]
}

export default function BlogListWithFilter({ posts }: BlogListWithFilterProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    posts.forEach(post => {
      if (post.tags && Array.isArray(post.tags)) {
        post.tags.forEach(tag => tagSet.add(tag))
      }
    })
    return Array.from(tagSet).sort()
  }, [posts])

  const filteredPosts = useMemo(() => {
    if (selectedTags.length === 0) return posts
    return posts.filter(post => {
      if (!post.tags) return false
      return selectedTags.every(tag => post.tags?.includes(tag))
    })
  }, [posts, selectedTags])

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const clearAll = () => setSelectedTags([])

  return (
    <div className="space-y-8">
      {allTags.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-gray-700 font-medium">
              <Tag className="w-4 h-4" />
              <span>按标签筛选</span>
              {selectedTags.length > 0 && (
                <span className="text-sm text-blue-500">
                  (已选 {selectedTags.length} 个)
                </span>
              )}
            </div>
            {selectedTags.length > 0 && (
              <button
                onClick={clearAll}
                className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
              >
                <X className="w-3 h-3" />
                <span>清除筛选</span>
              </button>
            )}
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTags([])}
              className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                selectedTags.length === 0
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              全部
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                  selectedTags.includes(tag)
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {filteredPosts.length} 篇文章</span>
        {selectedTags.length > 0 && (
          <span>
            筛选条件：{selectedTags.join(' + ')}
          </span>
        )}
      </div>

      {filteredPosts.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p>没有找到符合条件的文章</p>
          <button
            onClick={clearAll}
            className="mt-2 text-blue-500 hover:text-blue-600 transition-colors"
          >
            清除筛选条件
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredPosts.map(post => (
            <Link
              key={post.slug}
              href={`/notes/blog/${post.slug}`}
              className="block card p-6 hover:border-blue-300 group"
            >
              <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(post.date)}
                </span>
                {post.category && (
                  <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded">
                    {post.category}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-semibold mb-2 group-hover:text-blue-500 transition-colors">
                {post.title}
              </h2>
              {post.description && (
                <p className="text-gray-600 dark:text-gray-400 line-clamp-2">
                  {post.description}
                </p>
              )}
              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {post.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className={`text-xs px-2 py-1 rounded-full transition-colors ${
                        selectedTags.includes(tag)
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
