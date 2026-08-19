'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Home, Heart, Bell, Users, UserPlus, Compass, LogOut, ChevronRight } from 'lucide-react'

export default function MeHome({ userId, username }: { userId: number; username: string }) {
  const router = useRouter()
  const [stats, setStats] = useState({ postCount: 0, followerCount: 0, followingCount: 0 })
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    fetch('/api/social/users/' + userId).then((r) => r.json()).then((j) => { if (j.data?.stats) setStats(j.data.stats) }).catch(() => {})
    fetch('/api/social/notifications?page=1&pageSize=1').then((r) => r.json()).then((j) => { if (j.data?.unread != null) setUnread(j.data.unread) }).catch(() => {})
  }, [userId])

  const logout = async () => {
    try { await fetch('/api/logout', { method: 'POST' }) } catch {}
    router.push('/login')
  }

  const menu = [
    { href: '/me/favorites', label: '我的收藏', icon: Heart },
    { href: '/me/notifications', label: '我的通知', icon: Bell, badge: unread > 0 ? String(unread) : '' },
    { href: '/me/following', label: '我的关注', icon: UserPlus },
    { href: '/me/followers', label: '我的粉丝', icon: Users },
    { href: '/circle/user/' + userId, label: '我的公开旅行', icon: Compass },
  ]

  return (
    <div className="min-h-screen bg-album-bg0 pb-24">
      <div className="mx-auto max-w-2xl px-4">
        <header className="sticky top-0 z-20 -mx-4 mb-4 flex items-center justify-between border-b border-white/10 bg-album-bg0/90 px-4 py-3 backdrop-blur">
          <h1 className="text-sm font-semibold text-album-text1">个人主页</h1>
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-album-text2 hover:text-album-text1"><Home className="h-3.5 w-3.5" />返回首页</Link>
        </header>

        <div className="flex flex-col items-center py-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-album-accent/20 text-xl font-bold text-album-accent">{username.slice(0, 1).toUpperCase()}</div>
          <h2 className="mt-3 text-xl font-bold text-album-text1">{username}</h2>
          <div className="mt-4 flex gap-8">
            <div><div className="text-lg font-bold text-album-text1">{stats.postCount}</div><div className="text-xs text-album-text3">公开旅行</div></div>
            <div><div className="text-lg font-bold text-album-text1">{stats.followerCount}</div><div className="text-xs text-album-text3">粉丝</div></div>
            <div><div className="text-lg font-bold text-album-text1">{stats.followingCount}</div><div className="text-xs text-album-text3">关注</div></div>
          </div>
        </div>

        <nav className="space-y-2">
          {menu.map((m) => (
            <Link key={m.href} href={m.href} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-album-text1 hover:bg-white/10">
              <m.icon className="h-4 w-4 text-album-accent" />
              <span className="flex-1">{m.label}</span>
              {m.badge && <span className="rounded-full bg-album-accent/20 px-2 py-0.5 text-xs text-album-accent">{m.badge}</span>}
              <ChevronRight className="h-4 w-4 text-album-text3" />
            </Link>
          ))}
        </nav>

        <button onClick={logout} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-album-error hover:bg-white/10">
          <LogOut className="h-4 w-4" /> 退出登录
        </button>
      </div>
    </div>
  )
}
