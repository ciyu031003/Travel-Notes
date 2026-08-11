'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  Plus, Edit2, Trash2, LogOut, MapPin, BookOpen, BrainCircuit, 
  Code2, Search, Filter, Eye, Calendar, Tag, ImageIcon, Settings, Home, Sparkles
} from 'lucide-react'
interface Post {
  id: number
  slug: string
  title: string
  date: string
  summary: string | null
  cover: string | null
  images: string[] | null
  tags: string[] | null
  location: string | null
  type: string
  published: boolean
  createdAt: string
}

const typeIcons: Record<string, any> = {
  travel: MapPin,
  blog: BookOpen,
  mindmap: BrainCircuit,
  repo: Code2,
}

const typeLabels: Record<string, string> = {
  travel: '旅行记录',
  blog: '技术博客',
  mindmap: '思维导图',
  repo: '代码仓库',
}

export default function AdminDashboard() {
  const router = useRouter()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [deleteId, setDeleteId] = useState<number | null>(null)

  useEffect(() => {
    checkAuth()
    fetchPosts()
  }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/admin/check')
      if (!res.ok) {
        router.push('/admin/login')
        return
      }
      const data = await res.json()
      if (!data.authenticated) {
        router.push('/admin/login')
      }
    } catch {
      router.push('/admin/login')
    }
  }

  const fetchPosts = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/posts')
      const data = await res.json()
      setPosts(data.data?.posts || [])
    } catch {
      console.error('Failed to fetch posts')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await fetch(`/api/admin/posts/${deleteId}`, { method: 'DELETE' })
      setDeleteId(null)
      fetchPosts()
    } catch {
      console.error('Failed to delete post')
    }
  }

  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (post.summary && post.summary.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesType = !filterType || post.type === filterType
    return matchesSearch && matchesType
  })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-r from-primary-500 to-purple-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">AD</span>
              </div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">后台管理</h1>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                target="_blank"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Home className="w-4 h-4" />
                回到首页
              </Link>
              <Link
                href="/admin/repos"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
              >
                <Code2 className="w-4 h-4" />
                代码仓库管理
              </Link>
              <Link
                href="/admin/moments"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20"
              >
                <Sparkles className="w-4 h-4" />
                碎碎念管理
              </Link>
              <Link
                href="/admin/settings"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Settings className="w-4 h-4" />
                账号设置
              </Link>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">文章管理</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              共 {posts.length} 篇文章
            </p>
          </div>
          <Link
            href="/admin/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建文章
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索文章标题或摘要..."
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="pl-10 pr-10 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">全部分类</option>
              <option value="travel">旅行记录</option>
              <option value="blog">技术博客</option>
              <option value="mindmap">思维导图</option>
              <option value="repo">代码仓库</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-500">加载中...</div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <MapPin className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>暂无文章，点击右上角新建文章开始</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">文章</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">分类</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">日期</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">状态</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredPosts.map((post) => {
                    const Icon = typeIcons[post.type] || MapPin
                    return (
                      <tr key={post.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {post.cover ? (
                                <img
                                  src={post.cover.startsWith('/') ? post.cover : post.cover}
                                  alt={post.title}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    target.style.display = 'none'
                                  }}
                                />
                              ) : (
                                <Icon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">{post.title}</h3>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-md">
                                {post.summary || '暂无摘要'}
                              </p>
                              <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 flex-wrap">
                                {post.tags && Array.isArray(post.tags) && post.tags.length > 0 && (
                                  <div className="flex items-center gap-1">
                                    <Tag className="w-3 h-3" />
                                    <span>{post.tags.slice(0, 3).join(', ')}</span>
                                  </div>
                                )}
                                {post.type === 'travel' && post.images && Array.isArray(post.images) && post.images.length > 0 && (
                                  <div className="flex items-center gap-1 text-primary-500">
                                    <ImageIcon className="w-3 h-3" />
                                    <span>{post.images.length} 张照片</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400">
                            {typeLabels[post.type] || post.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                            <Calendar className="w-4 h-4 mr-1" />
                            {new Date(post.date).toLocaleDateString('zh-CN')}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {post.published ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                              已发布
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                              草稿
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/${post.type}/${post.slug}`}
                              target="_blank"
                              className="p-2 text-gray-400 hover:text-primary-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                              title="查看"
                            >
                              <Eye className="w-4 h-4" />
                            </Link>
                            <Link
                              href={`/admin/edit/${post.id}`}
                              className="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                              title="编辑"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Link>
                            <button
                              onClick={() => setDeleteId(post.id)}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">确认删除</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              此操作不可撤销，确定要删除这篇文章吗？
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

