'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { BookOpen, BrainCircuit, Code2, Folder } from 'lucide-react'

interface PostSummary {
  slug: string
  title: string
  description?: string
}

interface NotesData {
  blogCount: number
  repoCount: number
  mindmapCount: number
  recentPosts: PostSummary[]
}

export default function NotesPage() {
  const [data, setData] = useState<NotesData | null>(null)
  const [loading, setLoading] = useState(true)

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
      <header className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-sm mb-4">
          <Folder className="w-4 h-4" />
          <span>学习成长</span>
        </div>
        <h1 className="text-4xl font-bold mb-4">学习笔记</h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          记录学习轨迹，沉淀技术积累，构建个人知识体系
        </p>
      </header>

      <div className="grid md:grid-cols-3 gap-6 mb-16">
        {modules.map(module => (
          <Link
            key={module.href}
            href={module.href}
            className="card p-6 group"
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

      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">最新文章</h2>
          <Link href="/notes/blog" className="text-primary-500 hover:text-primary-600 text-sm">
            查看全部 →
          </Link>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {(data?.recentPosts || []).map(post => (
            <Link
              key={post.slug}
              href={`/notes/blog/${post.slug}`}
              className="card p-5 hover:border-blue-300 group"
            >
              <h3 className="font-semibold mb-2 group-hover:text-blue-500 transition-colors">
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
