'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminShell from '@/components/admin/AdminShell'
import { Loader2, Flag, Heart, MessageCircle, Bookmark, FileText } from 'lucide-react'

type Tab = 'posts' | 'comments' | 'reports'

export default function AdminSocialPage() {
  const [data, setData] = useState<any>(null)
  const [tab, setTab] = useState<Tab>('posts')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/social').then((r) => r.json()).then((j) => setData(j)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const stats = data?.stats

  const statCards = stats ? [
    { label: '公开旅行', value: stats.postCount, icon: FileText },
    { label: '点赞', value: stats.likeCount, icon: Heart },
    { label: '评论', value: stats.commentCount, icon: MessageCircle },
    { label: '收藏', value: stats.favoriteCount, icon: Bookmark },
    { label: '举报(待处理)', value: stats.reportCount + ' / ' + stats.pendingReportCount, icon: Flag },
  ] : []

  const tabs: { key: Tab; label: string }[] = [
    { key: 'posts', label: '帖子' },
    { key: 'comments', label: '评论' },
    { key: 'reports', label: '举报' },
  ]

  return (
    <AdminShell title="社交管理" accent="from-pink-400 via-rose-400 to-orange-300">
      <div className="space-y-6">
        {loading ? (
          <div className="py-20 text-center text-gray-400"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : !data ? (
          <p className="py-20 text-center text-gray-400">加载失败</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {statCards.map((s) => (
                <div key={s.label} className="rounded-2xl border border-gray-200/70 bg-white/70 p-4 backdrop-blur dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"><s.icon className="h-4 w-4" />{s.label}</div>
                  <div className="mt-2 text-2xl font-bold text-gray-800 dark:text-gray-100">{s.value}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              {tabs.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={tab === t.key ? 'rounded-full bg-travel-bloom px-4 py-1.5 text-sm font-medium text-white' : 'rounded-full bg-gray-100 px-4 py-1.5 text-sm text-gray-600 dark:bg-white/5 dark:text-gray-300'}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'posts' && (
              <div className="overflow-hidden rounded-2xl border border-gray-200/70 dark:border-white/10">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-white/5 dark:text-gray-400">
                    <tr><th className="px-4 py-2.5">标题</th><th className="px-4 py-2.5">作者</th><th className="px-4 py-2.5">点赞/评论/收藏</th><th className="px-4 py-2.5">发布时间</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                    {(data.posts || []).map((p: any) => (
                      <tr key={p.id} className="text-gray-700 dark:text-gray-200">
                        <td className="px-4 py-2.5"><Link href={'/circle/' + p.id} className="hover:text-travel-accent">{p.title}</Link></td>
                        <td className="px-4 py-2.5">{p.author?.username || '-'}</td>
                        <td className="px-4 py-2.5 tabular-nums">{p.likeCount}/{p.commentCount}/{p.favoriteCount}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('zh-CN') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'comments' && (
              <div className="space-y-2">
                {(data.comments || []).map((c: any) => (
                  <div key={c.id} className="rounded-2xl border border-gray-200/70 bg-white/70 p-3.5 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-medium text-gray-700 dark:text-gray-200">{c.user?.username || '-'}</span>
                      <span>· 评论了 <Link href={'/circle/' + c.post?.id} className="text-travel-accent">{c.post?.title || '#' + c.postId}</Link></span>
                      <span>· {c.status}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-200">{c.content}</p>
                  </div>
                ))}
                {(data.comments || []).length === 0 && <p className="py-10 text-center text-gray-400">暂无评论</p>}
              </div>
            )}

            {tab === 'reports' && (
              <div className="space-y-2">
                {(data.reports || []).map((r: any) => (
                  <div key={r.id} className="rounded-2xl border border-gray-200/70 bg-white/70 p-3.5 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-medium text-gray-700 dark:text-gray-200">{r.reporter?.username || '-'}</span>
                      <span>举报了 <Link href={'/circle/' + r.post?.id} className="text-travel-accent">{r.post?.title || '#' + r.postId}</Link></span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">{r.status}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-200">{r.reason}</p>
                  </div>
                ))}
                {(data.reports || []).length === 0 && <p className="py-10 text-center text-gray-400">暂无举报</p>}
              </div>
            )}
          </>
        )}
      </div>
    </AdminShell>
  )
}
