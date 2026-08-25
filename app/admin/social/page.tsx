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
  const [processing, setProcessing] = useState<number | null>(null)
  const [notice, setNotice] = useState('')

  const load = () => {
    fetch('/api/admin/social').then((r) => r.json()).then((j) => setData(j)).catch(() => {})
  }

  useEffect(() => {
    fetch('/api/admin/social').then((r) => r.json()).then((j) => setData(j)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  // v3.1 M3-B2：处理举报（驳回/下架/隐藏评论/封禁警告）
  const handleReport = async (reportId: number, action: string) => {
    if (processing) return
    const label = { DISMISS: '驳回举报', TAKEDOWN_POST: '下架帖子', HIDE_COMMENT: '隐藏评论', BAN_USER: '封禁警告' } as Record<string, string>
    if (!window.confirm(`确认执行「${label[action] || action}」？`)) return
    setProcessing(reportId)
    setNotice('')
    try {
      const res = await fetch('/api/admin/social/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, action }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '处理失败')
      setNotice(j.message || '处理成功')
      load()
    } catch (e: any) {
      setNotice(e.message || '处理失败')
    } finally {
      setProcessing(null)
    }
  }

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
    <AdminShell title="社交管理" accent="from-travel-accent to-travel-bloom">
      <div className="space-y-6">
        {loading ? (
          <div className="py-20 text-center text-gray-400"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : !data ? (
          <p className="py-20 text-center text-gray-400">加载失败</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {statCards.map((s) => (
                <div key={s.label} className="rounded-2xl border border-travel-line/50 bg-white/80 p-4 backdrop-blur shadow-soft dark:border-shell-line dark:bg-white/5">
                  <div className="flex items-center gap-2 text-xs text-travel-ink/60 dark:text-gray-400"><s.icon className="h-4 w-4 text-travel-accentSoft" />{s.label}</div>
                  <div className="mt-2 text-2xl font-bold text-travel-ink dark:text-gray-100">{s.value}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              {tabs.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={tab === t.key ? 'rounded-full bg-travel-accent px-4 py-1.5 text-sm font-medium text-white shadow-sm shadow-travel-accent/25' : 'rounded-full bg-white/70 px-4 py-1.5 text-sm text-travel-ink/70 hover:bg-travel-sakura/40 dark:bg-white/5 dark:text-gray-300'}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'posts' && (
              <div className="overflow-hidden rounded-2xl border border-travel-line/50 dark:border-shell-line">
                {(data.posts || []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-travel-ink/50 dark:text-gray-400">
                    <FileText className="mb-3 h-10 w-10 opacity-30 text-travel-accentSoft" />
                    <p>还没有公开的旅行帖子</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-travel-sakura/40 text-xs text-travel-ink/70 dark:bg-white/5 dark:text-gray-400">
                      <tr><th className="px-4 py-2.5">标题</th><th className="px-4 py-2.5">作者</th><th className="px-4 py-2.5">点赞/评论/收藏</th><th className="px-4 py-2.5">发布时间</th></tr>
                    </thead>
                    <tbody className="divide-y divide-travel-line/40 dark:divide-white/5">
                      {(data.posts || []).map((p: any) => (
                        <tr key={p.id} className="text-travel-ink dark:text-gray-200">
                          <td className="px-4 py-2.5"><Link href={'/circle/' + p.id} className="hover:text-travel-accent">{p.title}</Link></td>
                          <td className="px-4 py-2.5">{p.author?.username || '-'}</td>
                          <td className="px-4 py-2.5 tabular-nums">{p.likeCount}/{p.commentCount}/{p.favoriteCount}</td>
                          <td className="px-4 py-2.5 text-xs text-travel-ink/50">{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('zh-CN') : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === 'comments' && (
              <div className="space-y-2">
                {(data.comments || []).map((c: any) => (
                  <div key={c.id} className="rounded-2xl border border-travel-line/50 bg-white/70 p-3.5 dark:border-shell-line dark:bg-white/5">
                    <div className="flex items-center gap-2 text-xs text-travel-ink/60 dark:text-gray-400">
                      <span className="font-medium text-travel-ink dark:text-gray-200">{c.user?.username || '-'}</span>
                      <span>· 评论了 <Link href={'/circle/' + c.post?.id} className="text-travel-accent">{c.post?.title || '#' + c.postId}</Link></span>
                      <span>· {c.status}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-travel-ink dark:text-gray-200">{c.content}</p>
                  </div>
                ))}
                {(data.comments || []).length === 0 && <p className="py-10 text-center text-travel-ink/50">暂无评论</p>}
              </div>
            )}

            {tab === 'reports' && (
              <div className="space-y-2">
                {notice && <p className="rounded-xl bg-travel-success/10 px-3 py-2 text-sm text-travel-success">{notice}</p>}
                {(data.reports || []).map((r: any) => (
                  <div key={r.id} className="rounded-2xl border border-travel-line/50 bg-white/70 p-3.5 dark:border-shell-line dark:bg-white/5">
                    <div className="flex items-center gap-2 text-xs text-travel-ink/60 dark:text-gray-400">
                      <span className="font-medium text-travel-ink dark:text-gray-200">{r.reporter?.username || '-'}</span>
                      <span>举报了 <Link href={'/circle/' + r.post?.id} className="text-travel-accent">{r.post?.title || '#' + r.postId}</Link></span>
                      <span className="rounded-full bg-travel-warning/15 px-2 py-0.5 text-travel-warning">{r.status}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-travel-ink dark:text-gray-200">{r.reason}</p>
                    {r.status === 'PENDING' && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {[
                          ['DISMISS', '驳回'],
                          ['TAKEDOWN_POST', '下架帖子'],
                          ['HIDE_COMMENT', '隐藏评论'],
                          ['BAN_USER', '封禁警告'],
                        ].map(([action, label]) => (
                          <button
                            key={action}
                            type="button"
                            onClick={() => handleReport(r.id, action)}
                            disabled={processing === r.id}
                            className={`rounded-full px-3 py-1 text-xs transition disabled:opacity-50 ${
                              action === 'DISMISS'
                                ? 'bg-white/70 text-travel-ink/70 hover:bg-travel-sakura/40 dark:bg-white/5 dark:text-gray-300'
                                : action === 'BAN_USER'
                                  ? 'bg-travel-danger/10 text-travel-danger hover:bg-travel-danger/20 dark:bg-red-500/10 dark:text-red-300'
                                  : 'bg-travel-sakura/60 text-travel-accent hover:bg-travel-sakura dark:bg-travel-accent/15'
                            }`}
                          >
                            {processing === r.id ? '处理中...' : label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {(data.reports || []).length === 0 && <p className="py-10 text-center text-travel-ink/50">暂无举报</p>}
              </div>
            )}
          </>
        )}
      </div>
    </AdminShell>
  )
}
