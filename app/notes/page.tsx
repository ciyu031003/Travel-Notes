'use client'

import React, { useState, useEffect, useMemo } from 'react'
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

  const getPageClass = (pageIndex: number) =>
    pageIndex === currentPage ? 'page-active' : 'page-hidden'

  const sectionStyle = (pageIndex: number): React.CSSProperties => ({
    position: 'absolute',
    inset: 0,
    top: '3.5rem',
    pointerEvents: pageIndex === currentPage ? 'auto' : 'none',
  })

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
      {/* 极简透明导航栏 - Page 2/3 去掉右侧菜单 */}
      <nav className="fixed top-0 inset-x-0 z-50">
        <div className="w-full px-6 sm:px-8 lg:px-12 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm">
              <BookOpen className="w-3 h-3 text-white" />
            </span>
            <span className="text-xs font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">
              学习笔记
            </span>
          </Link>
          {currentPage === 0 && (
            <div className="flex items-center gap-1">
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
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors ${
                      active
                        ? 'text-blue-600 font-medium'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          )}
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

      {/* 全屏页面容器 */}
      <div ref={setScrollContainer} className="notes-scroll-container pt-14">
        {/* ==================== Page 1: 极简沉浸式首页 ==================== */}
        <section className="notes-page-section" style={sectionStyle(0)}>
          <div className={getPageClass(0)}>
            {/* 极淡的装饰光晕 */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute rounded-full bg-sky-100/40 blur-3xl" style={{ width: 600, height: 600, top: '10%', right: '5%' }} />
              <div className="absolute rounded-full bg-indigo-100/30 blur-3xl" style={{ width: 500, height: 500, bottom: '10%', left: '5%' }} />
            </div>

            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-6">
              {/* 主标题 - 艺术感粗体 */}
              <h1 className="page-enter stagger-1 notes-hero-title text-center select-none">
                学习笔记
              </h1>

              {/* 副标题 - 纤细轻盈 */}
              <p className="page-enter stagger-2 notes-hero-sub text-center">
                Knowledge Base · 记录学习轨迹，沉淀技术积累
              </p>

              {/* 搜索框 - 适中宽度，不抢夺主导 */}
              <form onSubmit={handleQuickSearch} className={`page-enter stagger-3 mx-auto mt-10`} style={{ width: '42vw', minWidth: '360px', maxWidth: '560px' }}>
                <div className="notes-hero-search flex items-center px-5 py-3.5 rounded-full">
                  <Search className="w-4 h-4 text-slate-400 mr-3 shrink-0" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="搜索文章、思维导图、代码"
                    className="flex-1 bg-transparent outline-none text-slate-800 placeholder:text-slate-400 text-sm"
                  />
                  <button type="submit" className="notes-hero-search-btn px-5 py-1.5 text-xs font-medium shrink-0">
                    搜索
                  </button>
                </div>
              </form>
            </div>

            {/* 底部 SCROLL 指示 */}
            {currentPage === 0 && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                <div className="text-[10px] tracking-[0.3em] text-slate-300 font-medium uppercase">SCROLL</div>
                <ChevronDown className="w-3 h-3 text-slate-300 animate-bounce" />
              </div>
            )}
          </div>
        </section>

        {/* ==================== Page 2: 技术博客（杂志风格） ==================== */}
        <section className="notes-page-section" style={sectionStyle(1)}>
          <div className={getPageClass(1)}>
            {/* 装饰几何元素 */}
            <svg className="absolute top-[15%] left-8 opacity-[0.04] pointer-events-none" width="200" height="200" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="90" fill="none" stroke="#2563EB" strokeWidth="1" />
              <circle cx="100" cy="100" r="60" fill="none" stroke="#2563EB" strokeWidth="0.5" />
              <line x1="10" y1="100" x2="190" y2="100" stroke="#2563EB" strokeWidth="0.3" />
              <line x1="100" y1="10" x2="100" y2="190" stroke="#2563EB" strokeWidth="0.3" />
            </svg>

            <div className="relative z-10 w-full h-full flex items-center px-10 lg:px-16">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 w-full max-w-7xl">
                {/* 左侧：主标题 + 统计 */}
                <div className="lg:col-span-5 flex flex-col justify-center">
                  <div className={`page-enter stagger-1 flex items-center gap-2 mb-4`}>
                    <span className="text-[10px] tracking-[0.25em] font-semibold text-blue-600 uppercase">Tech Blog</span>
                    <span className="h-px flex-1 bg-blue-200/60" />
                  </div>

                  <h2 className="page-enter stagger-1 notes-magazine-title mb-4">
                    技术博客
                  </h2>

                  <p className="page-enter stagger-2 text-sm text-slate-500 font-light tracking-wide mb-10">
                    TECH BLOG · 学习笔记、技术总结、问题排查记录
                  </p>

                  {/* 精致数据统计 */}
                  <div className={`page-enter stagger-3 flex items-center gap-6`}>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold text-slate-900 tabular-nums">
                        {(stats?.totalPosts ?? data?.blogCount ?? 0) > 0 ? (stats?.totalPosts ?? data?.blogCount) : 12}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">篇文章</span>
                    </div>
                    <div className="w-px h-6 bg-slate-200" />
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold text-slate-900 tabular-nums">
                        {formatReadingTime((stats?.totalReadingMinutes ?? 0) > 0 ? (stats?.totalReadingMinutes ?? 0) : 480)}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">阅读</span>
                    </div>
                    <div className="w-px h-6 bg-slate-200" />
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold text-slate-900 tabular-nums">
                        {(stats?.monthlyCount ?? 0) > 0 ? stats?.monthlyCount : 3}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">本月新增</span>
                    </div>
                  </div>
                </div>

                {/* 右侧：精选文章卡片 */}
                <div className="lg:col-span-7 flex flex-col justify-center">
                  <div className="space-y-4">
                    {recentPosts.length > 0 ? (
                      recentPosts.slice(0, 2).map((post, idx) => (
                        <Link
                          key={post.slug}
                          href={postHref(post)}
                          className={`page-enter stagger-${idx + 2} notes-featured-card group block`}
                        >
                          <div className="flex items-start gap-5">
                            <div className="shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center font-mono text-xs text-blue-600 font-semibold">
                              {String(idx + 1).padStart(2, '0')}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5">
                                {post.date && (
                                  <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {formatDate(post.date)}
                                  </span>
                                )}
                                {post.tags && post.tags.length > 0 && (
                                  <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
                                    {post.tags[0]}
                                  </span>
                                )}
                              </div>
                              <h3 className="text-base font-semibold text-slate-800 group-hover:text-blue-600 transition-colors line-clamp-1">
                                {post.title}
                              </h3>
                              {post.description && (
                                <p className="text-sm text-slate-500 line-clamp-2 mt-1">
                                  {post.description}
                                </p>
                              )}
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                          </div>
                        </Link>
                      ))
                    ) : (
                      <>
                        <div className="page-enter stagger-2 notes-featured-card">
                          <div className="flex items-start gap-5">
                            <div className="shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center font-mono text-xs text-blue-600 font-semibold">01</div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1"><Calendar className="w-3 h-3" />2025-01-15</span>
                                <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">Next.js</span>
                              </div>
                              <h3 className="text-base font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">Next.js 项目部署到阿里云 ECS 完整指南</h3>
                              <p className="text-sm text-slate-500 line-clamp-2 mt-1">从零开始，将 Next.js 项目部署到阿里云 ECS 服务器的完整步骤</p>
                            </div>
                          </div>
                        </div>
                        <div className="page-enter stagger-3 notes-featured-card">
                          <div className="flex items-start gap-5">
                            <div className="shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center font-mono text-xs text-blue-600 font-semibold">02</div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1"><Calendar className="w-3 h-3" />2025-01-10</span>
                                <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">TailwindCSS</span>
                              </div>
                              <h3 className="text-base font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">Tailwind CSS 深度定制：设计系统构建实践</h3>
                              <p className="text-sm text-slate-500 line-clamp-2 mt-1">从设计 Token 到组件库，如何用 Tailwind 构建可维护的设计系统</p>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className={`page-enter stagger-4 mt-6 pl-15`} style={{ paddingLeft: '3.75rem' }}>
                    <Link
                      href="/notes/blog"
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1.5 transition-colors"
                    >
                      查看全部文章 <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* 底部页码与滚动引导 */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
              <div className="text-[10px] tracking-[0.3em] text-slate-300 font-medium uppercase">SCROLL</div>
              <ChevronDown className="w-3 h-3 text-slate-300 animate-bounce" />
            </div>
          </div>
        </section>

        {/* ==================== Page 3: 知识图谱 & 代码仓库（对称双栏） ==================== */}
        <section className="notes-page-section" style={sectionStyle(2)}>
          <div className={getPageClass(2)}>
            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-8 lg:px-16">
              {/* 顶部主标题区 */}
              <div className="text-center mb-10">
                <div className={`page-enter stagger-1 flex items-center justify-center gap-3 mb-3`}>
                  <span className="text-[10px] tracking-[0.25em] font-semibold text-blue-600 uppercase">Mindmap & Repository</span>
                  <code className="text-[11px] text-slate-300 font-mono">{'</>'}</code>
                </div>

                <h2 className="page-enter stagger-1 notes-magazine-title mb-3" style={{ fontSize: 'clamp(2.5rem, 10vw, 6rem)' }}>
                  知识图谱 &amp; 代码仓库
                </h2>

                <p className="page-enter stagger-2 text-sm text-slate-500 font-light tracking-wide">
                  系统化知识梳理 · 个人项目展示
                </p>
              </div>

              {/* 对称双栏卡片 */}
              <div className="page-enter stagger-3 grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                {/* 左侧：思维导图 */}
                <Link
                  href="/notes/mindmap"
                  className="notes-sym-card group block"
                >
                  {/* 视觉化：思维导图节点预览 */}
                  <div className="notes-mindmap-visual mb-5">
                    <svg width="100%" height="100" viewBox="0 0 320 100" fill="none">
                      {/* 中心节点 */}
                      <circle cx="160" cy="50" r="10" fill="#2563EB" />
                      <circle cx="160" cy="50" r="16" fill="#2563EB" opacity="0.12" />
                      {/* 左侧连线 + 节点 */}
                      <line x1="150" y1="46" x2="80" y2="30" stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
                      <circle cx="75" cy="30" r="5" fill="#22c55e" opacity="0.8" />
                      <line x1="150" y1="54" x2="70" y2="70" stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
                      <circle cx="65" cy="72" r="5" fill="#a855f7" opacity="0.7" />
                      {/* 右侧连线 + 节点 */}
                      <line x1="170" y1="46" x2="240" y2="25" stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
                      <circle cx="245" cy="23" r="5" fill="#22c55e" opacity="0.8" />
                      <line x1="170" y1="54" x2="255" y2="70" stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
                      <circle cx="260" cy="72" r="5" fill="#a855f7" opacity="0.7" />
                      {/* 小分支 */}
                      <line x1="72" y1="28" x2="50" y2="15" stroke="#94a3b8" strokeWidth="0.5" />
                      <circle cx="48" cy="14" r="3" fill="#22c55e" opacity="0.5" />
                      <line x1="258" y1="28" x2="280" y2="15" stroke="#94a3b8" strokeWidth="0.5" />
                      <circle cx="282" cy="14" r="3" fill="#a855f7" opacity="0.5" />
                    </svg>
                  </div>

                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                      思维导图
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-0.5 rounded">
                      {(data?.mindmapCount ?? 0) > 0 ? data?.mindmapCount : 8} maps
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed mb-4">
                    覆盖网络安全 · 运维 · 编程体系
                  </p>

                  <div className="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
                    浏览导图 <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </Link>

                {/* 右侧：代码仓库 */}
                <Link
                  href="/notes/repo"
                  className="notes-sym-card group block"
                >
                  {/* 视觉化：代码预览 */}
                  <div className="notes-code-visual mb-5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="w-2 h-2 rounded-full bg-red-400" />
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="w-2 h-2 rounded-full bg-green-400" />
                      <span className="ml-2 text-[10px] text-slate-500 font-mono">main</span>
                    </div>
                    <div className="font-mono text-[11px] leading-relaxed">
                      <div className="text-slate-300"><span className="text-slate-500 mr-3">01</span><span className="text-blue-400">const</span> <span className="text-violet-400">repo</span> = <span className="text-green-400">await</span> <span className="text-amber-400">fetchRepo</span>()</div>
                      <div className="text-slate-300"><span className="text-slate-500 mr-3">02</span><span className="text-blue-400">const</span> <span className="text-violet-400">files</span> = <span className="text-violet-400">repo</span>.files</div>
                      <div className="text-slate-300"><span className="text-slate-500 mr-3">03</span><span className="text-slate-500">return</span> files.map(...)</div>
                    </div>
                  </div>

                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                      代码仓库
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-0.5 rounded">
                      {(data?.repoCount ?? 0) > 0 ? data?.repoCount : 5} repos
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed mb-4">
                    个人项目展示 · 在线代码浏览
                  </p>

                  <div className="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
                    浏览代码 <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </Link>
              </div>
            </div>

            {/* 底部页码 + 返回顶部 */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4">
              <div className="text-[11px] text-slate-400 font-mono">
                <span className="text-slate-600 font-semibold">03</span>
                <span className="mx-1 text-slate-300">/</span>
                <span>03</span>
              </div>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="text-slate-400 hover:text-blue-500 transition-colors"
                aria-label="返回顶部"
              >
                <ChevronDown className="w-4 h-4 rotate-180" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
