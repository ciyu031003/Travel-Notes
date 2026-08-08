'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  BrainCircuit,
  Code2,
  Search,
  Calendar,
  FileText,
  ArrowRight,
  Home,
  Map,
  MessageSquare,
  ChevronDown,
  GitBranch,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { useFullScreenScroll } from '@/hooks/useFullScreenScroll'

interface PostSummary {
  slug: string
  title: string
  description?: string
  date?: string
  type?: string
  tags?: string[]
}

interface Stats {
  totalPosts: number
  totalReadingMinutes: number
  monthlyCount: number
  blogCount: number
  mindmapCount: number
}

interface PopularTag {
  name: string
  count: number
}

interface NotesData {
  blogCount: number
  repoCount: number
  mindmapCount: number
  recentPosts: PostSummary[]
  stats?: Stats
  popularTags?: PopularTag[]
}

function formatReadingTime(minutes: number): string {
  if (!minutes || minutes <= 0) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h <= 0) return `${m}m`
  if (m <= 0) return `${h}h`
  return `${h}h ${m}m`
}

function postHref(post: PostSummary): string {
  return post.type === 'mindmap'
    ? `/notes/mindmap/${post.slug}`
    : `/notes/blog/${post.slug}`
}

const TOTAL_PAGES = 3

export default function NotesPage() {
  const router = useRouter()
  const [data, setData] = useState<NotesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')

  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null)

  const { currentPage, goToPage } = useFullScreenScroll({
    totalPages: TOTAL_PAGES,
    lockDuration: 700,
    targetRef: { current: scrollContainer },
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/notes')
        if (res.ok) {
          const result = await res.json()
          setData(result)
        }
      } catch {}
      setLoading(false)
    }
    fetchData()

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchInput.trim()
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`)
    }
  }

  const stats = data?.stats
  const recentPosts = useMemo(() => (data?.recentPosts || []).slice(0, 6), [data])

  // 当前页内容类名：active 页可见，其他页淡出隐藏
  const getPageClass = (pageIndex: number) =>
    pageIndex === currentPage ? 'page-active' : 'page-hidden'

  if (loading) {
    return (
      <div className="notes-light-bg min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-sky-200" />
            <div className="absolute inset-0 rounded-full border-t-2 border-sky-500 animate-spin" />
          </div>
          <p className="text-slate-500 text-sm tracking-wider">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="notes-light-bg">
      {/* 固定浅色顶部导航 */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center shadow-sm">
              <BookOpen className="w-3.5 h-3.5 text-white" />
            </span>
            <span className="text-sm font-semibold text-slate-800 group-hover:text-sky-600 transition-colors">
              学习笔记
            </span>
          </Link>
          <div className="flex items-center gap-0.5">
            {[
              { href: '/', label: '首页', icon: Home },
              { href: '/travel', label: '旅行', icon: Map },
              { href: '/notes', label: '笔记', icon: BookOpen },
              { href: '/messages', label: '留言', icon: MessageSquare },
            ].map((item) => {
              const Icon = item.icon
              const active = item.href === '/notes'
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? 'bg-sky-50 text-sky-600'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      {/* 右侧进度指示器 */}
      <div className="page-indicator">
        {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
          <button
            key={i}
            onClick={() => goToPage(i)}
            className={`page-indicator-dot ${i === currentPage ? 'active' : ''}`}
            aria-label={`Page ${i + 1}`}
          />
        ))}
      </div>

      {/* 页面计数器 */}
      <div className="fixed bottom-6 right-6 z-[60] text-xs font-mono text-slate-400 select-none">
        <span className="text-sky-500 font-semibold">{String(currentPage + 1).padStart(2, '0')}</span>
        <span className="mx-1.5 text-slate-300">/</span>
        <span>{String(TOTAL_PAGES).padStart(2, '0')}</span>
      </div>

      {/* 全屏页面容器：所有 section 绝对定位叠放 */}
      <div ref={setScrollContainer} className="notes-scroll-container pt-14">
        {/* ==================== Page 1: 首页 + 搜索 ==================== */}
        <section
          className="notes-page-section"
          style={{
            position: 'absolute',
            inset: 0,
            top: '3.5rem',
          }}
        >
          <div className={getPageClass(0)}>
            {/* 装饰背景 */}
            <div className="tech-blob bg-sky-200/30" style={{ width: 400, height: 400, top: '10%', right: '-5%' }} />
            <div className="tech-blob bg-indigo-200/25" style={{ width: 350, height: 350, bottom: '5%', left: '-3%' }} />

            <div className="relative z-10 w-full max-w-3xl mx-auto px-6 text-center">
              <div className={`page-enter inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-sky-50 border border-sky-200/60 text-sky-600 text-xs font-medium mb-8 stagger-1`}>
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                <span>Knowledge Base</span>
              </div>

              <h1 className="page-enter stagger-2 text-6xl md:text-7xl lg:text-8xl font-bold mb-6 tracking-tight leading-[1.05]">
                <span className="tech-gradient-text">学习笔记</span>
              </h1>

              <p className="page-enter stagger-2 text-slate-500 max-w-xl mx-auto text-base md:text-lg mb-10 leading-relaxed">
                记录学习轨迹，沉淀技术积累，构建个人知识体系
              </p>

              <form onSubmit={handleQuickSearch} className={`page-enter stagger-3 max-w-xl mx-auto`}>
                <div className="tech-search flex items-center px-5 py-4">
                  <Search className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="搜索文章、思维导图、代码..."
                    className="flex-1 bg-transparent outline-none text-slate-800 placeholder:text-slate-400 text-base"
                  />
                  <button type="submit" className="tech-btn px-5 py-2.5 text-sm font-medium shrink-0">
                    搜索
                  </button>
                </div>
              </form>

              <div className={`page-enter stagger-4 flex items-center justify-center gap-3 mt-8`}>
                {[
                  { href: '/notes/blog', label: '技术博客', icon: BookOpen, count: data?.blogCount ?? 0 },
                  { href: '/notes/mindmap', label: '思维导图', icon: BrainCircuit, count: data?.mindmapCount ?? 0 },
                  { href: '/notes/repo', label: '代码仓库', icon: Code2, count: data?.repoCount ?? 0 },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="tech-tag rounded-full px-4 py-2 text-sm font-medium flex items-center gap-1.5"
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                    <span className="text-xs text-slate-400">· {item.count}</span>
                  </Link>
                ))}
              </div>
            </div>

            {currentPage === 0 && (
              <div className="scroll-hint">
                <span>Scroll</span>
                <ChevronDown className="w-4 h-4" />
              </div>
            )}
          </div>
        </section>

        {/* ==================== Page 2: 技术博客 ==================== */}
        <section
          className="notes-page-section"
          style={{
            position: 'absolute',
            inset: 0,
            top: '3.5rem',
          }}
        >
          <div className={getPageClass(1)}>
            <div className="tech-blob bg-indigo-200/20" style={{ width: 350, height: 350, top: '0%', left: '10%' }} />

            <div className="relative z-10 w-full max-w-5xl mx-auto px-6">
              <div className={`page-enter mb-8`}>
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-5 h-5 text-sky-500" />
                  <span className="text-xs font-semibold tracking-[0.15em] text-sky-500 uppercase">
                    Tech Blog
                  </span>
                </div>
                <h2 className="text-4xl font-bold text-slate-900 mb-2">技术博客</h2>
                <p className="text-slate-500">学习笔记、技术总结、问题排查记录</p>
              </div>

              <div className={`page-enter stagger-1 flex items-center gap-8 mb-8 py-4 border-y border-slate-200/60`}>
                <div>
                  <div className="text-3xl font-bold tech-stat-number">{stats?.totalPosts ?? data?.blogCount ?? 0}</div>
                  <div className="text-xs text-slate-400 mt-0.5">累计文章</div>
                </div>
                <div className="w-px h-10 bg-slate-200" />
                <div>
                  <div className="text-3xl font-bold tech-stat-number">
                    {formatReadingTime(stats?.totalReadingMinutes ?? 0)}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">阅读时长</div>
                </div>
                <div className="w-px h-10 bg-slate-200" />
                <div>
                  <div className="text-3xl font-bold tech-stat-number">{stats?.monthlyCount ?? 0}</div>
                  <div className="text-xs text-slate-400 mt-0.5">本月新增</div>
                </div>
              </div>

              <div
                className="notes-inner-scroll"
                style={{ maxHeight: 'calc(100vh - 340px)' }}
                onWheel={(e) => e.stopPropagation()}
              >
                <div className="space-y-3 pr-2">
                  {recentPosts.length > 0 ? (
                    recentPosts.map((post, idx) => (
                      <Link
                        key={post.slug}
                        href={postHref(post)}
                        className={`page-enter tech-card p-5 flex items-start gap-4 group stagger-${Math.min(idx + 2, 4)}`}
                      >
                        <div className="shrink-0 w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center font-mono text-xs text-sky-600 font-semibold">
                          {String(idx + 1).padStart(2, '0')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {post.date && (
                              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDate(post.date)}
                              </span>
                            )}
                            {post.tags && post.tags.length > 0 && (
                              <span className="text-[10px] text-sky-500 bg-sky-50 px-1.5 py-0.5 rounded font-medium">
                                {post.tags[0]}
                              </span>
                            )}
                          </div>
                          <h3 className="font-semibold text-slate-800 group-hover:text-sky-600 transition-colors line-clamp-1">
                            {post.title}
                          </h3>
                          {post.description && (
                            <p className="text-sm text-slate-500 line-clamp-1 mt-0.5">
                              {post.description}
                            </p>
                          )}
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-sky-500 transition-colors shrink-0 mt-1" />
                      </Link>
                    ))
                  ) : (
                    <div className="tech-card p-8 text-center text-slate-400">
                      <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p>暂无文章</p>
                    </div>
                  )}
                </div>
              </div>

              <div className={`page-enter stagger-4 mt-6 flex justify-center`}>
                <Link
                  href="/notes/blog"
                  className="text-sm text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1"
                >
                  查看全部文章 <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== Page 3: 思维导图 + 代码仓库 ==================== */}
        <section
          className="notes-page-section"
          style={{
            position: 'absolute',
            inset: 0,
            top: '3.5rem',
          }}
        >
          <div className={getPageClass(2)}>
            <div className="tech-blob bg-violet-200/20" style={{ width: 400, height: 400, bottom: '10%', right: '5%' }} />

            <div className="relative z-10 w-full max-w-5xl mx-auto px-6">
              <div className={`page-enter mb-8 text-center`}>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <BrainCircuit className="w-5 h-5 text-sky-500" />
                  <span className="text-xs font-semibold tracking-[0.15em] text-sky-500 uppercase">
                    Mindmap & Repository
                  </span>
                  <Code2 className="w-5 h-5 text-indigo-500" />
                </div>
                <h2 className="text-4xl font-bold text-slate-900 mb-2">知识图谱 & 代码仓库</h2>
                <p className="text-slate-500">系统化知识梳理 · 个人项目展示</p>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <Link
                  href="/notes/mindmap"
                  className="page-enter stagger-2 tech-card p-6 group cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center shadow-sm">
                      <BrainCircuit className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xs text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded">
                      {data?.mindmapCount ?? 0} maps
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-800 mb-2 group-hover:text-sky-600 transition-colors">
                    思维导图
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed mb-4">
                    系统化知识梳理，涵盖网络安全、运维、编程体系等技术领域
                  </p>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="tech-dot" />
                    <div className="w-8 h-px bg-sky-200" />
                    <div className="tech-dot" />
                    <div className="w-8 h-px bg-indigo-200" />
                    <div className="tech-dot" />
                  </div>
                  <div className="flex items-center gap-1 text-sm text-sky-600 font-medium">
                    浏览导图 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </Link>

                <Link
                  href="/notes/repo"
                  className="page-enter stagger-3 tech-card p-6 group cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm">
                      <Code2 className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xs text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded">
                      {data?.repoCount ?? 0} repos
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-800 mb-2 group-hover:text-indigo-600 transition-colors">
                    代码仓库
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed mb-4">
                    个人项目展示，类 GitHub 在线代码浏览，包含完整文件树和代码高亮
                  </p>
                  <div className="bg-slate-900/90 rounded-lg p-3 mb-4 font-mono text-[10px]">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="w-2 h-2 rounded-full bg-red-400" />
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="w-2 h-2 rounded-full bg-green-400" />
                      <span className="ml-2 text-slate-500">main</span>
                    </div>
                    <div className="text-slate-400 leading-relaxed">
                      <span className="text-sky-400">const</span> <span className="text-violet-300">repo</span> = <span className="text-green-300">await</span> <span className="text-amber-300">fetchRepo</span>()
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-indigo-600 font-medium">
                    浏览代码 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </Link>
              </div>

              {data?.popularTags && data.popularTags.length > 0 && (
                <div className={`page-enter stagger-4 mt-6`}>
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <GitBranch className="w-4 h-4 text-slate-400" />
                    <span className="text-xs text-slate-400 font-medium">热门标签</span>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {data.popularTags.slice(0, 10).map((tag) => (
                      <Link
                        key={tag.name}
                        href={`/notes/tags/${encodeURIComponent(tag.name)}`}
                        className="tech-tag rounded-full px-3 py-1 text-xs font-medium"
                      >
                        <span className="text-sky-500">#</span>
                        {tag.name}
                        <span className="text-slate-400 ml-1">{tag.count}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
