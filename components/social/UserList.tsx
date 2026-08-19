'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, User } from 'lucide-react'

export default function UserList({ endpoint, title }: { endpoint: string; title: string }) {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(endpoint).then((r) => r.json()).then((j) => setUsers(j.data || [])).catch(() => {}).finally(() => setLoading(false))
  }, [endpoint])

  return (
    <div className="min-h-screen bg-album-bg0 pb-24">
      <div className="mx-auto max-w-2xl px-4">
        <header className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-3 border-b border-white/10 bg-album-bg0/90 px-4 py-3 backdrop-blur">
          <Link href="/me" className="rounded-full p-1.5 text-album-text2 hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></Link>
          <h1 className="text-sm font-semibold text-album-text1">{title}</h1>
        </header>
        {loading ? (
          <div className="py-20 text-center text-album-text3"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
        ) : users.length === 0 ? (
          <p className="py-20 text-center text-sm text-album-text3">暂无数据</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <Link key={u.id} href={'/circle/user/' + u.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-album-accent/20 text-album-accent"><User className="h-4 w-4" /></span>
                <span className="text-sm text-album-text1">{u.username}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
