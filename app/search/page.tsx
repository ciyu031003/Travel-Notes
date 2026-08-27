'use client'

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Search, X, MapPin, Tag, Loader2, ArrowRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'

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
}

const SUGGESTED_TAGS = ['旅行', '城市', '美食', '纪念日', '夏天', '冬天', '海边', '山野']

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
  return safe.replace(re, '<mark class="bg-travel-bloom/40 text-travel-accentStrong rounded px-0.5">$&</mark>')
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="container-custom">
        <div className="max-w-2xl mx-auto text-center py-16 text-travel-sand">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-travel-accentSoft" />
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
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
      if (res.ok) {
        const json = (await res.json()) as { data?: { results?: SearchResult[] } }
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

  const keyword = query.trim()

  const handleClear = () => {
    setQuery('')
    setResults([])
    setHasSearched(false)
    inputRef.current?.focus()
  }

  const hasResults = useMemo(() => results.length > 0, [results])

  return (
    <div className="container-custom py-10 md:py-14">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-travel-inkStrong dark:text-shell-text mb-2">
          搜索旅行记录
        </h1>
        <p className="text-sm text-travel-sand dark:text-shell-muted mb-6">
          查找每一段旅行足迹
        </p>

        {/* 搜索框 */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-travel-sand/70" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') performSearch(query)
            }}
            placeholder="输入城市、地点或关键词..."
            className="w-full pl-12 pr-12 py-3.5 rounded-2xl border border-travel-line dark:border-shell-line bg-white dark:bg-shell-surface2 text-travel-inkStrong dark:text-shell-text outline-none focus:ring-2 focus:ring-travel-accentSoft focus:border-transparent shadow-sm"
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-travel-sand/70 hover:text-travel-ink dark:hover:text-shell-text hover:bg-travel-sakura/40 dark:hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 加载中 */}
        {loading && (
          <div className="card p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-travel-accentSoft" />
            <p className="text-sm text-travel-sand">搜索中...</p>
          </div>
        )}

        {/* 未搜索状态 */}
        {!loading && !hasSearched && (
          <div className="card p-8 text-center">
            <MapPin className="w-12 h-12 mx-auto mb-4 text-travel-sakura" />
            <p className="text-sm text-travel-sand dark:text-shell-muted mb-4">
              输入关键词开始搜索，或试试以下热门标签：
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTED_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setQuery(tag)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-travel-sakura/50 dark:bg-travel-accent/15 text-travel-accentStrong dark:text-travel-accentSoft text-sm hover:bg-travel-sakura dark:hover:bg-travel-accentStrong/40 transition-colors"
                >
                  <Tag className="w-3 h-3" />
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 无结果 */}
        {!loading && hasSearched && !hasResults && (
          <div className="card p-8 text-center">
            <p className="text-travel-ink dark:text-shell-text mb-2">未找到相关内容</p>
            <p className="text-sm text-travel-sand mb-4">
              {keyword ? `没有匹配「${keyword}」的旅行记录` : '请输入搜索关键词'}
            </p>
          </div>
        )}

        {/* 结果列表 */}
        {!loading && hasResults && (
          <div className="space-y-4">
            {results.map((post) => {
              return (
                <Link
                  key={`${post.slug}-${post.id}`}
                  href={`/travel/${post.slug}`}
                  className="card ribbon-hover block p-5 hover:border-travel-sakura dark:hover:border-travel-accentStrong group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-travel-accent">
                      <MapPin className="w-3.5 h-3.5" />
                      旅行记录
                    </span>
                    <span className="text-xs text-travel-sand/70 dark:text-shell-faint">
                      {formatDate(post.date)}
                    </span>
                  </div>
                  <h3
                    className="text-lg font-semibold text-travel-inkStrong dark:text-shell-text group-hover:text-travel-accent transition-colors mb-1.5"
                    dangerouslySetInnerHTML={{ __html: highlight(post.title, keyword) }}
                  />
                  {post.description && (
                    <p
                      className="text-sm text-travel-ink dark:text-shell-text line-clamp-2"
                      dangerouslySetInnerHTML={{ __html: highlight(post.description, keyword) }}
                    />
                  )}
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {post.tags.slice(0, 5).map((tag) => (
                        <span
                          key={tag}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-travel-sakura/60 dark:bg-white/10 text-travel-sand dark:text-shell-text"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-1 text-xs text-travel-accentSoft opacity-0 group-hover:opacity-100 transition-opacity">
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
  )
}
