'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, CheckCheck } from 'lucide-react'
import SocialAvatar from '@/components/social/SocialAvatar'

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
    <div className="min-h-screen bg-night-bg pb-28 text-night-text">
      <div className="relative mx-auto max-w-2xl px-4 py-6">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/me" className="rounded-full p-2 text-night-muted ring-1 ring-night-line transition hover:text-night-text"><ArrowLeft className="h-5 w-5" /></Link>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-night-gold/85">Inbox</p>
              <h1 className="text-xl font-semibold">我的通知</h1>
            </div>
            {unread > 0 && <span className="rounded-full bg-night-goldSoft px-2 py-0.5 text-xs text-night-gold">{unread} 未读</span>}
          </div>
          <button onClick={markAll} disabled={busy || unread === 0} className="inline-flex items-center gap-1 rounded-full bg-night-surface px-3 py-1.5 text-xs text-night-muted ring-1 ring-night-line hover:text-night-text disabled:opacity-40"><CheckCheck className="h-3.5 w-3.5" />全部已读</button>
        </header>
        {loading ? (
          <div className="py-20 text-center text-night-faint"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : data.length === 0 ? (
          <p className="py-20 text-center text-sm text-night-faint">暂无通知。</p>
        ) : (
          <div className="space-y-1.5">
            {data.map((n) => {
              const name = n.actor?.nickname || n.actor?.username || '有人'
              return (
                <Link key={n.id} href={targetHref(n)} className="flex items-start gap-3 border-b border-night-line px-2 py-3.5 transition hover:bg-night-surface/50">
                  <SocialAvatar name={name} avatarUrl={n.actor?.avatarUrl} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed text-night-muted"><span className="font-semibold text-night-text">{name}</span> {typeLabel[n.type] || '与你互动'}</p>
                    <p className="mt-0.5 text-xs text-night-faint">{new Date(n.createdAt).toLocaleString('zh-CN')}</p>
                  </div>
                  {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-night-gold" />}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
