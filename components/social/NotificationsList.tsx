'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Bell, CheckCheck } from 'lucide-react'

export default function NotificationsList() {
  const [data, setData] = useState<any[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/social/notifications?page=1&pageSize=50')
      if (res.ok) { const j = await res.json(); setData(j.data?.data || []); setUnread(j.data?.unread || 0) }
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const markAll = async () => {
    setBusy(true)
    try { await fetch('/api/social/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }) } catch {} finally { setBusy(false); await load() }
  }

  const typeLabel: Record<string, string> = { LIKE: '赞了你的旅行', COMMENT: '评论了你的旅行', REPLY: '回复了你的评论', FAVORITE: '收藏了你的旅行', FOLLOW: '关注了你' }

  const targetHref = (n: any) => {
    if (n.refType === 'User') return '/circle/user/' + n.refId
    if (n.refType === 'TravelPost') return '/circle/' + n.refId
    return '/circle'
  }

  return (
    <div className="min-h-screen bg-album-bg0 pb-24">
      <div className="mx-auto max-w-2xl px-4">
        <header className="sticky top-0 z-20 -mx-4 mb-4 flex items-center justify-between border-b border-white/10 bg-album-bg0/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <Link href="/me" className="rounded-full p-1.5 text-album-text2 hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></Link>
            <h1 className="text-sm font-semibold text-album-text1">我的通知</h1>
            {unread > 0 && <span className="rounded-full bg-album-accent/20 px-2 py-0.5 text-xs text-album-accent">{unread} 未读</span>}
          </div>
          <button onClick={markAll} disabled={busy || unread === 0} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-album-text2 hover:text-album-text1 disabled:opacity-40"><CheckCheck className="h-3.5 w-3.5" />全部已读</button>
        </header>
        {loading ? (
          <div className="py-20 text-center text-album-text3"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : data.length === 0 ? (
          <p className="py-20 text-center text-sm text-album-text3">暂无通知</p>
        ) : (
          <div className="space-y-2">
            {data.map((n) => (
              <Link key={n.id} href={targetHref(n)} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-album-accent/20 text-album-accent"><Bell className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-album-text1">{n.actor?.username || '有人'} {typeLabel[n.type] || '与你互动'}</p>
                  <p className="mt-0.5 text-xs text-album-text3">{new Date(n.createdAt).toLocaleString('zh-CN')}</p>
                </div>
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-album-accent" />}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
