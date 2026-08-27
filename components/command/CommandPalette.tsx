'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Search,
  Home,
  MapPin,
  Image as ImageIcon,
  Images,
  CalendarDays,
  Sparkles,
  X,
  Loader2,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  FileText,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface SearchResult {
  id: number
  slug: string
  title: string
  date: string
  description?: string
  tags?: string[]
}

interface QuickLink {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  hint?: string
}

const QUICK_LINKS: QuickLink[] = [
  { href: '/', label: '首页', icon: Home },
  { href: '/travel', label: '旅行记录', icon: MapPin },
  { href: '/timeline', label: '时间线', icon: CalendarDays },
  { href: '/album', label: '私密照片墙', icon: ImageIcon },
  { href: '/albums', label: '纪念相册', icon: Images },
  { href: '/moments', label: '碎碎念', icon: Sparkles },
  { href: '/search', label: '全站搜索', icon: Search },
]

const HIDDEN_PREFIXES = ['/admin', '/login', '/forgot-password']

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  const hidden = useMemo(
    () => HIDDEN_PREFIXES.some((p) => pathname.startsWith(p)),
    [pathname]
  )

  const performSearch = useCallback(async (keyword: string) => {
    const trimmed = keyword.trim()
    if (!trimmed) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
      if (res.ok) {
        const json = await res.json()
        const list = json?.data?.results ?? []
        setResults(Array.isArray(list) ? list.slice(0, 8) : [])
      } else {
        setResults([])
      }
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!open) return
    debounceRef.current = setTimeout(() => {
      performSearch(query)
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open, performSearch])

  // 全局快捷键 Cmd+K / Ctrl+K
  useEffect(() => {
    if (hidden) return
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [hidden])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => inputRef.current?.focus(), 30)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(timer)
      document.body.style.overflow = originalOverflow
    }
  }, [open])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setResults([])
    setActiveIndex(0)
  }, [])

  const totalItems = query.trim() ? results.length : QUICK_LINKS.length

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => Math.min(prev + 1, totalItems - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (query.trim() && results.length > 0 && activeIndex < results.length) {
        const item = results[activeIndex]
        router.push(`/travel/${item.slug}`)
        close()
      } else if (!query.trim() && QUICK_LINKS[activeIndex]) {
        router.push(QUICK_LINKS[activeIndex].href)
        close()
      }
    }
  }

  if (hidden) return null
  if (!open) return null

  const showQuickLinks = !query.trim()
  const showResults = query.trim()

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-shell-surface rounded-2xl shadow-2xl border border-travel-line dark:border-shell-line overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 输入区 */}
        <div className="flex items-center gap-3 px-5 h-14 border-b border-travel-line dark:border-shell-line">
          <Search className="w-5 h-5 text-travel-sand/70 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="搜索旅行记录，或输入命令..."
            className="flex-1 bg-transparent text-travel-inkStrong dark:text-shell-text text-base outline-none placeholder-travel-sand/50"
          />
          {loading ? (
            <Loader2 className="w-4 h-4 text-travel-sand/70 animate-spin flex-shrink-0" />
          ) : (
            <button
              type="button"
              onClick={close}
              className="p-1 rounded-md text-travel-sand/70 hover:text-travel-ink dark:hover:text-shell-text hover:bg-travel-sakura/40 dark:hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 结果区 */}
        <div className="max-h-[55vh] overflow-y-auto py-2" onMouseDown={(e) => e.preventDefault()}>
          {showQuickLinks && (
            <div className="px-3">
              <p className="px-3 py-2 text-xs text-travel-sand/70 dark:text-shell-faint font-medium">快捷入口</p>
              {QUICK_LINKS.map((link, idx) => {
                const Icon = link.icon
                return (
                  <button
                    key={link.href}
                    type="button"
                    onClick={() => {
                      router.push(link.href)
                      close()
                    }}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      idx === activeIndex
                        ? 'bg-travel-sakura/50 dark:bg-travel-accent/15 text-travel-accentStrong dark:text-travel-accentSoft'
                        : 'text-travel-ink dark:text-shell-text hover:bg-travel-sakura/40 dark:hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 text-sm">{link.label}</span>
                    {idx === activeIndex && <CornerDownLeft className="w-3.5 h-3.5 opacity-50" />}
                  </button>
                )
              })}
            </div>
          )}

          {showResults && (
            <div className="px-3">
              <p className="px-3 py-2 text-xs text-travel-sand/70 dark:text-shell-faint font-medium">
                {loading ? '搜索中...' : `搜索结果（${results.length}）`}
              </p>
              {results.length === 0 && !loading ? (
                <p className="px-3 py-6 text-center text-sm text-travel-sand/70 dark:text-shell-faint">
                  未找到与「{query.trim()}」相关的内容
                </p>
              ) : (
                results.map((item, idx) => {
                  return (
                    <button
                      key={`${item.slug}-${item.id}`}
                      type="button"
                      onClick={() => {
                        router.push(`/travel/${item.slug}`)
                        close()
                      }}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        idx === activeIndex
                          ? 'bg-travel-sakura/50 dark:bg-travel-accent/15'
                          : 'hover:bg-travel-sakura/40 dark:hover:bg-white/10'
                      }`}
                    >
                      <span className="mt-0.5 p-1.5 rounded-md flex-shrink-0 bg-travel-mist/60 dark:bg-travel-accent/15 text-travel-sky">
                        <FileText className="w-3.5 h-3.5" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-travel-inkStrong dark:text-shell-text truncate">{item.title}</span>
                        <span className="block text-xs text-travel-sand/70 dark:text-shell-faint truncate mt-0.5">
                          旅行记录 · {formatDate(item.date)}
                        </span>
                      </span>
                      {idx === activeIndex && <CornerDownLeft className="w-3.5 h-3.5 mt-1 opacity-50" />}
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-t border-travel-line dark:border-shell-line text-xs text-travel-sand/70 dark:text-shell-faint">
          <span className="flex items-center gap-1">
            <ArrowUp className="w-3 h-3" />
            <ArrowDown className="w-3 h-3" />
            选择
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="w-3 h-3" />
            打开
          </span>
          <span className="flex items-center gap-1">
            <span className="font-mono">Esc</span>
            关闭
          </span>
          <span className="ml-auto">Ctrl/⌘ + K 唤起</span>
        </div>
      </div>
    </div>
  )
}



