'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Search, Calendar, Tag, X } from 'lucide-react'
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

interface TagInfo {
  name: string
  count: number
}

interface BlogToolbarProps {
  posts: BlogPost[]
  allTags: TagInfo[]
  basePath: string
}

// 按数量映射标签字号
function tagSizeClass(count: number, max: number): string {
  if (max <= 0) return 'text-xs'
  const ratio = count / max
  if (ratio >= 0.75) return 'text-base'
  if (ratio >= 0.5) return 'text-sm'
  return 'text-xs'
}

export default function BlogToolbar({ posts, allTags, basePath }: BlogToolbarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // debounce 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // 年份归档（按年降序）
  const years = useMemo(() => {
    const yearCount = new Map<string, number>()
    for (const post of posts) {
      const y = new Date(post.date).getFullYear().toString()
      if (isNaN(Number(y))) continue
      yearCount.set(y, (yearCount.get(y) ?? 0) + 1)
    }
    return Array.from(yearCount.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => Number(b.year) - Number(a.year))
  }, [posts])

  const maxTagCount = useMemo(
    () => allTags.reduce((m, t) => Math.max(m, t.count), 0),
    [allTags],
  )

  const filteredPosts = useMemo(() => {
    const q = debouncedQuery.toLowerCase()
    return posts.filter((post) => {
      if (q) {
        const titleMatch = post.title.toLowerCase().includes(q)
        const descMatch = post.description?.toLowerCase().includes(q) ?? false
        if (!titleMatch && !descMatch) return false
      }
      if (selectedTag) {
        if (!post.tags || !post.tags.includes(selectedTag)) return false
      }
      if (selectedYear) {
        const y = new Date(post.date).getFullYear().toString()
        if (y !== selectedYear) return false
      }
      return true
    })
  }, [posts, debouncedQuery, selectedTag, selectedYear])

  const hasFilter = !!debouncedQuery || !!selectedTag || !!selectedYear

  const clearFilters = () => {
    setSearchQuery('')
    setDebouncedQuery('')
    setSelectedTag(null)
    setSelectedYear(null)
  }

  return (
    <div className="space-y-6">
      {/* 三栏工具栏 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 搜索框 */}
        <div className="card p-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 mb-2">
            <Search className="w-4 h-4 text-rose-400" />
            <span>搜索文章</span>
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="输入标题或摘要..."
              className="w-full pl-3 pr-8 py-2 text-sm rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 focus:outline-none focus:border-rose-300 focus:ring-1 focus:ring-rose-200 dark:focus:ring-rose-700 transition-colors text-gray-700 dark:text-gray-200 placeholder:text-gray-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="清除搜索"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 标签云 */}
        <div className="card p-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 mb-3">
            <Tag className="w-4 h-4 text-rose-400" />
            <span>标签云</span>
          </div>
          {allTags.length === 0 ? (
            <p className="text-xs text-gray-400">暂无标签</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedTag(null)}
                className={`px-2.5 py-1 rounded-full transition-all ${
                  selectedTag === null
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-rose-50 hover:text-rose-500'
                }`}
              >
                <span className="text-xs">全部</span>
              </button>
              {allTags.map(tag => (
                <button
                  key={tag.name}
                  onClick={() => setSelectedTag(prev => (prev === tag.name ? null : tag.name))}
                  className={`px-2.5 py-1 rounded-full transition-all ${
                    selectedTag === tag.name
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-rose-50 hover:text-rose-500'
                  } ${selectedTag === tag.name ? 'text-xs' : tagSizeClass(tag.count, maxTagCount)}`}
                >
                  #{tag.name}
                  <span className="ml-1 opacity-60">{tag.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 时间归档 */}
        <div className="card p-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 mb-3">
            <Calendar className="w-4 h-4 text-rose-400" />
            <span>时间归档</span>
          </div>
          {years.length === 0 ? (
            <p className="text-xs text-gray-400">暂无文章</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedYear(null)}
                className={`px-2.5 py-1 rounded-full text-xs transition-all ${
                  selectedYear === null
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-rose-50 hover:text-rose-500'
                }`}
              >
                全部
              </button>
              {years.map(({ year, count }) => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(prev => (prev === year ? null : year))}
                  className={`px-2.5 py-1 rounded-full text-xs transition-all ${
                    selectedYear === year
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-rose-50 hover:text-rose-500'
                  }`}
                >
                  {year}
                  <span className="ml-1 opacity-60">{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 结果统计 */}
      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <span>共 {filteredPosts.length} 篇文章</span>
        {hasFilter && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-rose-500 transition-colors"
          >
            <X className="w-3 h-3" />
            <span>清除筛选</span>
          </button>
        )}
      </div>

      {/* 文章列表 */}
      {filteredPosts.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <p>没有找到符合条件的文章</p>
          {hasFilter && (
            <button
              onClick={clearFilters}
              className="mt-2 text-sm text-rose-500 hover:text-rose-600 transition-colors"
            >
              清除筛选条件
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPosts.map(post => (
            <Link
              key={post.slug}
              href={`${basePath}/${post.slug}`}
              className="group block card p-5 hover:border-rose-200 hover:shadow-md transition-all"
            >
              <div className="flex gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(post.date)}</span>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 group-hover:text-rose-500 transition-colors mb-2">
                    {post.title}
                  </h2>
                  {post.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                      {post.description}
                    </p>
                  )}
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {post.tags.map(tag => (
                        <span
                          key={tag}
                          className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                            selectedTag === tag
                              ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300'
                          }`}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {post.cover && (
                  <div className="flex-shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={post.cover}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
