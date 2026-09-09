'use client'

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Search, X, MapPin, Tag, Loader2, ArrowRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { travelDetailHref } from '@/lib/routes'
import { apiUrl } from '@/lib/api-base'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { SkeletonCard } from '@/components/mobile/Skeleton'
import { EmptyState } from '@/components/mobile/EmptyState'
import { Stagger } from '@/components/mobile/Stagger'

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
      const res = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(trimmed)}`))
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
    <>
    {/* 桌面端：保留既有杂志风格搜索 */}
    <div className="container-custom hidden py-10 md:block md:py-14">
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
                  href={travelDetailHref(post.slug)}
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
                          className="text-xs px-2 py-0.5 rounded-full bg-travel-sakura/60 dark:bg-white/10 text-travel-sand dark:text-shell-text"
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

    {/* 移动端：iOS 大标题内嵌搜索 + 结果骨架 */}
    <div className="md:hidden">
      <div className="min-h-screen bg-[var(--m-bg)] pb-[calc(88px+env(safe-area-inset-bottom))] text-[var(--m-text)]">
        <LargeTitle title="搜索" subtitle="输入关键词，找回每一段旅行足迹" />
        <div className="px-4 pt-1">
          {/* iOS 搜索栏 */}
          <div className="flex items-center gap-2.5 rounded-2xl bg-[var(--m-surface-2)] px-3.5 transition-all focus-within:ring-2 focus-within:ring-[var(--m-accent)]">
            <Search className="h-[18px] w-[18px] shrink-0 text-[var(--m-faint)]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') performSearch(query)
              }}
              placeholder="搜索城市、地点或关键词"
              enterKeyHint="search"
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)]"
            />
            {query && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="清空搜索"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgb(255,255,255,0.55)] text-[var(--m-muted)] transition-transform active:scale-90 dark:bg-[rgb(255,255,255,0.14)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="mt-5">
            {/* 结果骨架 */}
            {loading && (
              <div className="space-y-4">
                {[0, 1, 2].map((index) => <SkeletonCard key={index} />)}
              </div>
            )}

            {/* 未搜索：热门标签 */}
            {!loading && !hasSearched && (
              <div className="px-1">
                <p className="text-[13px] text-[var(--m-muted)]">试试以下热门标签：</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTED_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setQuery(tag)}
                      className="m-press m-chip inline-flex items-center gap-1.5"
                    >
                      <Tag className="h-3.5 w-3.5" />
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 无结果 */}
            {!loading && hasSearched && !hasResults && (
              <EmptyState
                icon={MapPin}
                title="未找到相关内容"
                description={keyword ? `没有匹配「${keyword}」的旅行记录` : '请输入搜索关键词'}
              />
            )}

            {/* 结果列表 */}
            {!loading && hasResults && (
              <Stagger className="space-y-3" delayBase={80} step={30}>
                {results.map((post) => (
                  <Link
                    key={`${post.slug}-${post.id}`}
                    href={travelDetailHref(post.slug)}
                    className="m-card block p-4 transition-transform active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--m-accent-strong)]">
                        <MapPin className="h-3.5 w-3.5" />
                        旅行记录
                      </span>
                      <span className="text-xs text-[var(--m-faint)]">{formatDate(post.date)}</span>
                    </div>
                    <h3
                      className="mt-2 text-[16px] font-semibold leading-snug text-[var(--m-text)]"
                      dangerouslySetInnerHTML={{ __html: highlight(post.title, keyword) }}
                    />
                    {post.description && (
                      <p
                        className="mt-1 text-[13px] leading-relaxed text-[var(--m-muted)] line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: highlight(post.description, keyword) }}
                      />
                    )}
                    {post.tags && post.tags.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {post.tags.slice(0, 5).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-[var(--m-accent-soft)] px-2.5 py-0.5 text-xs text-[var(--m-accent-strong)]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </Stagger>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
