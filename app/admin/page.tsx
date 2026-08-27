'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'motion/react'
import {
  Plus, Edit2, Trash2, MapPin, Search, Filter, Eye, Calendar, Tag,
  Globe2, Lock, Loader2, X, FileText, Sparkles, ExternalLink,
} from 'lucide-react'
import AdminShell from '@/components/admin/AdminShell'

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
  isPublic?: boolean
  createdAt: string
}

const typeLabels: Record<string, string> = { travel: '旅行记录' }
const typeIconBg: Record<string, string> = {
  travel: 'from-travel-accentSoft to-pink-400',
}

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 24, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as any } },
}

export default function AdminDashboard() {
  const router = useRouter()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    checkAuth()
    fetchPosts()
  }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/admin/check')
      const data = await res.json()
      if (!res.ok || !data.authenticated) router.push('/admin/login')
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

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await fetch(`/api/admin/posts/${deleteId}`, { method: 'DELETE' })
      setDeleteId(null)
      fetchPosts()
    } catch {
      console.error('Failed to delete post')
    } finally {
      setDeleting(false)
    }
  }

  const togglePublic = async (post: Post) => {
    setTogglingId(post.id)
    try {
      const res = await fetch(`/api/admin/posts/${post.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: !post.isPublic }),
      })
      if (res.ok) {
        setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, isPublic: !post.isPublic } : p)))
      }
    } catch {
      console.error('Failed to toggle public')
    } finally {
      setTogglingId(null)
    }
  }

  const filteredPosts = posts.filter((post) => {
    const q = searchQuery.toLowerCase()
    const matchesSearch =
      post.title.toLowerCase().includes(q) || (post.summary || '').toLowerCase().includes(q)
    const matchesType = !filterType || post.type === filterType
    return matchesSearch && matchesType
  })

  const glassInput =
    'w-full rounded-xl border border-white/70 bg-white/75 dark:border-white/10 dark:bg-white/5 px-4 py-2.5 text-sm text-[#3D4852] dark:text-shell-text placeholder-[#9A958F] shadow-sm backdrop-blur-xl transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-travel-accentSoft/50'

  return (
    <AdminShell title="文章管理">
      {/* 页头 */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-travel-sakura/70 px-3 py-1 text-xs font-medium text-travel-accent dark:bg-shell-surface/70 dark:text-travel-bloom">
            <Sparkles className="h-3 w-3" />
            行迹内容中心
          </div>
          <h1 className="mt-3 text-2xl font-bold text-[#2D3842] dark:text-shell-text sm:text-3xl">文章管理</h1>
          <p className="mt-1 text-sm text-travel-ink/70 dark:text-shell-muted">共 {posts.length} 篇文章，像明信片一样整理你们的回忆</p>
        </div>
        <Link
          href="/admin/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-travel-accent to-travel-accentSoft px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-travel-accent/25 transition-all hover:shadow-xl hover:-translate-y-0.5 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          新建文章
        </Link>
      </div>

      {/* 工具栏 */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A958F]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索标题或摘要..."
            className={`${glassInput} pl-10`}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A958F]" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className={`${glassInput} appearance-none pl-10 pr-10`}
          >
            <option value="">全部分类</option>
            <option value="travel">旅行记录</option>
          </select>
        </div>
      </div>

      {/* 瀑布流卡片 */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-3xl bg-white/60 dark:bg-white/5" />
          ))}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-travel-bloom/50 bg-white/50 p-14 text-center dark:border-shell-line dark:bg-white/5">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-travel-sakura to-travel-bloom/60 dark:from-[#32261D] dark:to-[#4A3427]">
            <FileText className="h-8 w-8 text-travel-accent dark:text-travel-bloom" />
          </div>
          <h3 className="text-lg font-semibold text-[#3D4852] dark:text-shell-text">
            {posts.length === 0 ? '还没有文章' : '没有匹配的文章'}
          </h3>
          <p className="mt-1 text-sm text-travel-ink/70 dark:text-shell-muted">
            {posts.length === 0 ? '从第一篇游记开始，收藏你们的旅程' : '换个关键词试试吧'}
          </p>
          {posts.length === 0 && (
            <Link
              href="/admin/new"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-travel-accent to-travel-accentSoft px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-travel-accent/25 transition-all hover:-translate-y-0.5 active:scale-95"
            >
              <Plus className="h-4 w-4" />
              新建文章
            </Link>
          )}
        </div>
      ) : (
        <motion.div
          variants={listVariants}
          initial="hidden"
          animate="show"
          className="columns-1 gap-5 sm:columns-2 xl:columns-3"
        >
          {filteredPosts.map((post) => {
            const Icon = typeIconBg[post.type]
              ? null
              : MapPin
            return (
              <motion.article
                key={post.id}
                variants={cardVariants}
                className="group mb-5 break-inside-avoid overflow-hidden rounded-3xl border border-white/70 bg-white/85 shadow-[0_12px_40px_-12px_rgba(90,102,112,0.18)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_24px_60px_-16px_rgba(167,78,97,0.35)] dark:border-white/10 dark:bg-shell-bg/90"
              >
                {/* 封面 */}
                <Link href={`/${post.type}/${post.slug}`} target="_blank" className="relative block aspect-video w-full overflow-hidden bg-gradient-to-br from-travel-sakura via-travel-bloom/30 to-travel-sakura dark:from-[#32261D] dark:via-[#3A2B21] dark:to-[#241B15]">
                  {post.cover ? (
                    <Image
                      src={post.cover}
                      alt={post.title}
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => {
                        const t = e.target as HTMLImageElement
                        t.style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      {Icon && <Icon className="h-10 w-10 text-travel-accent/40 dark:text-travel-bloom/30" />}
                    </div>
                  )}
                  {/* 类型角标 */}
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                    {typeLabels[post.type] || post.type}
                  </span>
                  {/* 悬停查看 */}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/25 group-hover:opacity-100">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-2 text-xs font-medium text-travel-ink shadow-lg">
                      <Eye className="h-3.5 w-3.5" />
                      查看游记
                    </span>
                  </span>
                </Link>

                {/* 内容 */}
                <div className="p-5">
                  <Link href={`/${post.type}/${post.slug}`} target="_blank" className="block">
                    <h3 className="text-base font-bold leading-snug text-[#2D3842] transition-colors group-hover:text-travel-accent dark:text-shell-text dark:group-hover:text-travel-bloom">
                      {post.title}
                    </h3>
                  </Link>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-travel-ink/80 dark:text-shell-muted">
                    {post.summary || '还没有摘要，点击编辑为这篇文章写一句引言吧。'}
                  </p>

                  {/* 元信息 */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#9A958F]">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(post.date).toLocaleDateString('zh-CN')}
                    </span>
                    {post.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {post.location}
                      </span>
                    )}
                  </div>

                  {post.tags && post.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {post.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="rounded-full bg-travel-sakura/60 px-2 py-0.5 text-[11px] text-travel-accent dark:bg-shell-surface/80 dark:text-travel-bloom">
                          # {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 状态与操作 */}
                  <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3.5 dark:border-white/5">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        post.published
                          ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
                          : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'
                      }`}>
                        {post.published ? '已发布' : '草稿'}
                      </span>
                      <button
                        onClick={() => togglePublic(post)}
                        disabled={togglingId === post.id}
                        title={post.isPublic ? '点击设为仅自己可见' : '点击公开分享（所有人可见）'}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-all active:scale-95 disabled:opacity-60 ${
                          post.isPublic
                            ? 'bg-sky-100 text-sky-600 hover:bg-sky-200 dark:bg-sky-500/15 dark:text-sky-300'
                            : 'bg-gray-100 text-gray-500 hover:bg-amber-100 hover:text-amber-600 dark:bg-white/10 dark:text-gray-400'
                        }`}
                      >
                        {togglingId === post.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : post.isPublic ? (
                          <Globe2 className="h-3 w-3" />
                        ) : (
                          <Lock className="h-3 w-3" />
                        )}
                        {post.isPublic ? '公开' : '私密'}
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <Link
                        href={`/${post.type}/${post.slug}`}
                        target="_blank"
                        title="查看"
                        className="rounded-lg p-2 text-[#9A958F] transition-all hover:bg-travel-sakura/60 hover:text-travel-accent active:scale-90"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/admin/edit/${post.id}`}
                        title="编辑"
                        className="rounded-lg p-2 text-[#9A958F] transition-all hover:bg-travel-mist/60 hover:text-[#2E6E8E] active:scale-90"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => setDeleteId(post.id)}
                        title="删除"
                        className="rounded-lg p-2 text-[#9A958F] transition-all hover:bg-red-50 hover:text-red-500 active:scale-90 dark:hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.article>
            )
          })}
        </motion.div>
      )}

      {/* 移动端新建 FAB */}
      <Link
        href="/admin/new"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-travel-accent to-travel-accentSoft text-white shadow-xl shadow-travel-accent/35 transition-all hover:scale-105 active:scale-95 lg:hidden"
        aria-label="新建文章"
      >
        <Plus className="h-6 w-6" />
      </Link>

      {/* 删除确认（玻璃弹窗） */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={() => setDeleteId(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl border border-white/70 bg-white/95 p-6 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-shell-bg/95"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-500/10">
                  <Trash2 className="h-5 w-5 text-red-500" />
                </div>
                <h3 className="text-base font-semibold text-[#2D3842] dark:text-shell-text">删除这篇文章？</h3>
              </div>
              <button onClick={() => setDeleteId(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-black/5 dark:hover:bg-white/10" aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-travel-ink/80 dark:text-shell-muted">
              删除后不可恢复，确定要删除这篇游记吗？
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-travel-ink transition-all hover:bg-black/5 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-travel-accent py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-500/25 transition-all hover:shadow-xl active:scale-95 disabled:opacity-60"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                确认删除
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AdminShell>
  )
}

