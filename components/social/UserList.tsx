'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import SocialAvatar from '@/components/social/SocialAvatar'
import SocialThemeToggle from '@/components/social/SocialThemeToggle'

export default function UserList({ endpoint, title }: { endpoint: string; title: string }) {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(endpoint).then((r) => r.json()).then((j) => setUsers(j.data || [])).catch(() => {}).finally(() => setLoading(false))
  }, [endpoint])

  return (
    <div className="min-h-screen bg-[var(--social-bg)] pb-28 text-[var(--social-text)]">
      <div className="relative mx-auto max-w-2xl px-4 py-6">
        <header className="mb-8 flex items-center gap-3">
          <div className="ml-auto"><SocialThemeToggle /></div>
          <Link href="/me" className="rounded-full p-2 text-[var(--social-muted)] ring-1 ring-[var(--social-line)] transition hover:text-[var(--social-text)]"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-[var(--social-accent)]">People</p>
            <h1 className="text-xl font-semibold">{title}</h1>
          </div>
        </header>
        {loading ? (
          <div className="py-20 text-center text-[var(--social-faint)]"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : users.length === 0 ? (
          <p className="py-20 text-center text-sm text-[var(--social-faint)]">暂无数据。</p>
        ) : (
          <div className="space-y-1">
            {users.map((u) => {
              const name = u.nickname || u.username
              return (
                <Link key={u.id} href={'/circle/user/' + u.id} className="flex items-center gap-3 border-b border-[var(--social-line)] px-2 py-3.5 transition hover:bg-[var(--social-surface-50)]">
                  <SocialAvatar name={name} avatarUrl={u.avatarUrl} size={40} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                  <span className="text-xs text-[var(--social-faint)]">@{u.username}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
