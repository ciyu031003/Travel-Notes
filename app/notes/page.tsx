'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  BrainCircuit,
  Code2,
  Folder,
  Search,
  Calendar,
  Clock,
  FileText,
  Flame,
  Tag,
  ArrowRight,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

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

// 将阅读分钟数转换为 Xh Ym 格式
function formatReadingTime(minutes: number): string {
  if (!minutes || minutes <= 0) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h <= 0) return `${m}m`
  if (m <= 0) return `${h}h`
  return `${h}h ${m}m`
}

// 根据文章类型决定路由
function postHref(post: PostSummary): string {
  return post.type === 'mindmap'
    ? `/notes/mindmap/${post.slug}`
    : `/notes/blog/${post.slug}`
}

export default function NotesPage() {
  const router = useRouter()
  const [data, setData] = useState<NotesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')

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
  }, [])

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchInput.trim()
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`)
    }
  }

  const modules = [
    {
      title: '技术博客',
      description: '学习笔记、技术总结、问题排查记录',
      icon: BookOpen,
      href: '/notes/blog',
      color: 'blue',
      count: data?.blogCount ?? 0,
    },
    {
      title: '思维导图',
      description: '系统化知识梳理，网络安全、运维、编程体系',
      icon: BrainCircuit,
      href: '/notes/mindmap',
      color: 'purple',
      count: data?.mindmapCount ?? 0,
    },
    {
      title: '代码仓库',
      description: '个人项目展示，类 GitHub 在线代码浏览',
      icon: Code2,
      href: '/notes/repo',
      color: 'green',
      count: data?.repoCount ?? 0,
    },
  ]

  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-500',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-500',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-500',
  }

  const stats = data?.stats
  const popularTags = (data?.popularTags || []).slice(0, 10)

  const dashboardCards = [
    {
      label: '累计文章',
      value: stats?.totalPosts ?? data?.blogCount ?? 0,
      icon: FileText,
      bg: 'bg-rose-50 dark:bg-rose-900/20',
      iconColor: 'text-rose-500',
    },
    {
      label: '阅读时长',
      value: formatReadingTime(stats?.totalReadingMinutes ?? 0),
      icon: Clock,
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      iconColor: 'text-blue-500',
    },
    {
      label: '本月新增',
      value: stats?.monthlyCount ?? 0,
      icon: Calendar,
      bg: 'bg-green-50 dark:bg-green-900/20',
      iconColor: 'text-green-500',
    },
    {
      label: '连续学习',
      value: '-',
      icon: Flame,
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      iconColor: 'text-amber-500',
    },
  ]

  if (loading) {
    return (
      <div className="container-custom">
        <div className="text-center py-16 text-gray-500">
          <p>加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container-custom">
      <header className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-sm mb-4">
          <Folder className="w-4 h-4" />
          <span>学习成长</span>
        </div>
        <h1 className="text-4xl font-bold mb-4">学习笔记</h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          记录学习轨迹，沉淀技术积累，构建个人知识体系
        </p>
      </header>

      {/* 快速搜索入口 */}
      <div className="max-w-2xl mx-auto mb-12">
        <form onSubmit={handleQuickSearch} className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-rose-400 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索文章、思维导图..."
            className="w-full pl-12 pr-4 py-3 text-base rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-200 dark:focus:ring-rose-900/40 transition-all text-gray-800 dark:text-gray-100 placeholder:text-gray-400 shadow-sm"
          />
        </form>
      </div>

      {/* 模块入口 */}
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="card ribbon-hover p-6 group"
          >
            <div className={`w-14 h-14 ${colorClasses[module.color]} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
              <module.icon className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-semibold mb-2">{module.title}</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
              {module.description}
            </p>
            <div className="text-sm text-gray-500">
              共 {module.count} 项内容
            </div>
          </Link>
        ))}
      </div>

      {/* 学习仪表盘 */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">学习仪表盘</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {dashboardCards.map((card) => (
            <div key={card.label} className={`card p-5 ${card.bg}`}>
              <div className="flex items-center justify-between mb-3">
                <card.icon className={`w-6 h-6 ${card.iconColor}`} />
              </div>
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">
                {card.value}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {card.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 热门标签 */}
      {popularTags.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <Tag className="w-5 h-5 text-rose-400" />
              热门标签
            </h2>
            <Link
              href="/notes/tags"
              className="text-sm text-rose-500 hover:text-rose-600 transition-colors flex items-center gap-1"
            >
              查看全部
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {popularTags.map((tag) => (
              <Link
                key={tag.name}
                href={`/notes/tags/${encodeURIComponent(tag.name)}`}
                className="rounded-full bg-rose-50 dark:bg-rose-900/20 px-3 py-1 text-sm text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
              >
                #{tag.name}
                <span className="ml-1 text-xs text-rose-400">{tag.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 最新文章 */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">最新文章</h2>
          <Link href="/notes/blog" className="text-primary-500 hover:text-primary-600 text-sm">
            查看全部 →
          </Link>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {(data?.recentPosts || []).map((post) => (
            <Link
              key={post.slug}
              href={postHref(post)}
              className="card ribbon-hover p-5 hover:border-rose-200 dark:hover:border-rose-800 group"
            >
              {post.date && (
                <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mb-2">
                  <Calendar className="w-3 h-3" />
                  {formatDate(post.date)}
                </div>
              )}
              <h3 className="font-semibold mb-2 group-hover:text-rose-500 transition-colors">
                {post.title}
              </h3>
              {post.description && (
                <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2">
                  {post.description}
                </p>
              )}
            </Link>
          ))}
          {(!data?.recentPosts || data.recentPosts.length === 0) && (
            <div className="text-gray-500 text-sm">暂无文章</div>
          )}
        </div>
      </section>
    </div>
  )
}
