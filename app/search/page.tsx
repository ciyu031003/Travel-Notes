'use client'

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Search, X, BookOpen, BrainCircuit, Tag, Loader2, ArrowRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { searchStaticIndex } from '@/lib/search-index'

interface SearchResult {
  id: number
  slug: string
  title: string
  date: string
  description?: string
  cover?: string
  tags?: string[]
  type: string
  published: boolean
  module: 'blog' | 'mindmap'
}

interface SearchResponse {
  results?: SearchResult[]
}

type TabKey = 'all' | 'blog' | 'mindmap'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'blog', label: '博客' },
  { key: 'mindmap', label: '思维导图' },
]

// 热门标签建议（无搜索时展示）
const SUGGESTED_TAGS = ['React', 'Next.js', 'TypeScript', 'CSS', '网络安全', '运维', 'Python', '旅行']

// 转义 HTML 特殊字符，避免注入
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 将文本中的关键词包裹为 <mark>
function highlight(text: string, keyword: string): string {
  const safe = escapeHtml(text)
  if (!keyword) return safe
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(${escaped})`, 'gi')
  return safe.replace(re, '<mark class="bg-yellow-200 text-gray-900 rounded px-0.5">$&</mark>')
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="container-custom">
        <div className="max-w-2xl mx-auto text-center py-16 text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-rose-400" />
          <p className="text-sm">加载中...</p>
        </div>
      </div>
    }>
      <SearchContent />
    </Suspense>
  )
}

function SearchContent() {
  const searchParams = useSearchParams()

  const initialQuery = searchParams.get('q') || ''
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [hasSearched, setHasSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const performSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setResults([])
      setHasSearched(false)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      // 优先使用本地静态索引（构建期生成，即时返回，减轻服务器压力）
      const staticResults = await searchStaticIndex(trimmed)
      if (staticResults !== null) {
        setResults(staticResults as unknown as SearchResult[])
        setHasSearched(true)
        return
      }
      // 索引不可用（未生成/加载失败）时回退到服务端搜索
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
      if (res.ok) {
        const json = (await res.json()) as { data?: SearchResponse }
        const list = json?.data?.results ?? []
        setResults(Array.isArray(list) ? list : [])
      } else {
        setResults([])
      }
    } catch {
      setResults([])
    } finally {
      setHasSearched(true)
      setLoading(false)
    }
  }, [])

  // 输入后 debounce 500ms
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    const trimmed = query.trim()
    // 同步 URL 参数（支持分享和浏览器后退）
    const url = new URL(window.location.href)
    if (trimmed) {
      url.searchParams.set('q', trimmed)
    } else {
      url.searchParams.delete('q')
    }
    window.history.replaceState(null, '', url.toString())

    debounceTimer.current = setTimeout(() => {
      performSearch(query)
    }, 500)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [query, performSearch])

  // 初次挂载若 URL 带 q，直接触发一次搜索
  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery)
    } else {
      inputRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredResults = useMemo(() => {
    if (activeTab === 'all') return results
    return results.filter((r) => r.module === activeTab)
  }, [results, activeTab])

  const counts = useMemo(() => {
    return {
      all: results.length,
      blog: results.filter((r) => r.module === 'blog').length,
      mindmap: results.filter((r) => r.module === 'mindmap').length,
    }
  }, [results])

  const handleClear = () => {
    setQuery('')
    setResults([])
    setHasSearched(false)
    inputRef.current?.focus()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    performSearch(query)
  }

  const keyword = query.trim()

  return (
    <div className="container-custom">
      <div className="max-w-2xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">全站搜索</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            搜索博客文章与思维导图，快速定位你想要的内容
          </p>
        </header>

        {/* 搜索框 */}
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-rose-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索博客、思维导图..."
              className="w-full pl-12 pr-12 py-4 text-base rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-200 dark:focus:ring-rose-900/40 transition-all text-gray-800 dark:text-gray-100 placeholder:text-gray-400 shadow-sm"
            />
            {query && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-rose-500 transition-colors"
                aria-label="清除搜索"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </form>

        {/* Tab 切换（仅搜索后展示） */}
        {hasSearched && (
          <div className="flex items-center gap-6 mt-8 border-b border-gray-200 dark:border-gray-700">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key
              const count = counts[tab.key]
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative pb-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-rose-500'
                      : 'text-gray-500 dark:text-gray-400 hover:text-rose-400'
                  }`}
                >
                  {tab.label}
                  <span className="ml-1.5 text-xs text-gray-400">{count}</span>
                  {isActive && (
                    <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-rose-400 rounded-full" />
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* 内容区 */}
        <div className="mt-6">
          {/* 加载状态 */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-rose-400">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">搜索中...</p>
            </div>
          )}

          {/* 空状态：无搜索时显示搜索建议 */}
          {!loading && !hasSearched && (
            <div className="card p-8 text-center">
              <Search className="w-12 h-12 mx-auto mb-4 text-rose-200" />
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                输入关键词开始搜索，或试试以下热门标签：
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTED_TAGS.map((tag) => (
                  <Link
                    key={tag}
                    href={`/notes/tags/${encodeURIComponent(tag)}`}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 text-sm hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
                  >
                    <Tag className="w-3 h-3" />
                    {tag}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 无结果 */}
          {!loading && hasSearched && filteredResults.length === 0 && (
            <div className="card p-8 text-center">
              <p className="text-gray-600 dark:text-gray-300 mb-2">未找到相关内容</p>
              <p className="text-sm text-gray-400 mb-4">
                {keyword ? `没有匹配「${keyword}」的内容` : '请输入搜索关键词'}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTED_TAGS.slice(0, 5).map((tag) => (
                  <Link
                    key={tag}
                    href={`/notes/tags/${encodeURIComponent(tag)}`}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 text-sm hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
                  >
                    <Tag className="w-3 h-3" />
                    {tag}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 结果列表 */}
          {!loading && filteredResults.length > 0 && (
            <div className="space-y-4">
              {filteredResults.map((post) => {
                const href =
                  post.module === 'mindmap'
                    ? `/notes/mindmap/${post.slug}`
                    : `/notes/blog/${post.slug}`
                return (
                  <Link
                    key={`${post.module}-${post.slug}-${post.id}`}
                    href={href}
                    className="card ribbon-hover block p-5 hover:border-rose-200 dark:hover:border-rose-800 group"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {post.module === 'blog' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-500">
                          <BookOpen className="w-3.5 h-3.5" />
                          博客
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-500">
                          <BrainCircuit className="w-3.5 h-3.5" />
                          思维导图
                        </span>
                      )}
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {formatDate(post.date)}
                      </span>
                    </div>
                    <h3
                      className="text-lg font-semibold text-gray-800 dark:text-gray-100 group-hover:text-rose-500 transition-colors mb-1.5"
                      dangerouslySetInnerHTML={{ __html: highlight(post.title, keyword) }}
                    />
                    {post.description && (
                      <p
                        className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: highlight(post.description, keyword) }}
                      />
                    )}
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {post.tags.slice(0, 5).map((tag) => (
                          <span
                            key={tag}
                            className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-1 text-xs text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      查看详情
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

