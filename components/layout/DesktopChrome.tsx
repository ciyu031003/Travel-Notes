'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Home,
  Map,
  Compass,
  CalendarDays,
  MessageCircle,
  BookOpen,
  User,
  Search,
  Settings,
  LogOut,
  Moon,
  Sun,
  Bell,
} from 'lucide-react'
import BrandLogo from '@/components/brand/BrandLogo'
import { Icon } from '@/components/mobile/Icon'
import { apiUrl } from '@/lib/api-base'

const NAV = [
  { href: '/', label: '首页概览', icon: Home, exact: true },
  { href: '/travel', label: '旅行与足迹', icon: Map },
  { href: '/circle', label: '旅行圈', icon: Compass },
  { href: '/timeline', label: '时间线', icon: CalendarDays },
  { href: '/moments', label: '碎碎念', icon: MessageCircle },
  { href: '/album', label: '旅行画册', icon: BookOpen },
  { href: '/me', label: '个人空间', icon: User },
]

const IMMERSIVE = ['/login', '/forgot-password', '/admin', '/download']

export default function DesktopChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [username, setUsername] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(false)

  const isImmersive = IMMERSIVE.some((p) => pathname.startsWith(p))

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
    const themeObserver = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')))
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    const onShortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        router.push('/search')
      }
    }
    window.addEventListener('keydown', onShortcut)
    let cancelled = false
    fetch(apiUrl('/api/check-auth'), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.authenticated) setUsername(data.username ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      themeObserver.disconnect()
      window.removeEventListener('keydown', onShortcut)
    }
  }, [])

  if (isImmersive) return <>{children}</>

  const toggleTheme = () => {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {}
    setIsDark(next)
  }

  const handleLogout = async () => {
    try {
      await fetch(apiUrl('/api/logout'), { method: 'POST', credentials: 'include' })
    } catch {}
    router.push('/login')
  }

  const isActive = (item: (typeof NAV)[number]) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/')

  return (
    <>
      <aside className="web-sidebar hidden lg:flex" aria-label="主导航">
        <Link href="/" className="web-brand" aria-label="甜途 · 返回首页">
          <BrandLogo size={36} />
          <span>
            <b>甜途</b>
            <small>旅行记忆空间</small>
          </span>
        </Link>

        <Link href="/search" className="web-search">
          <Icon icon={Search} size="sm" />
          <span>搜索地点、旅程或记忆</span>
          <kbd>⌘ K</kbd>
        </Link>

        <nav className="web-nav">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(item) ? 'is-active' : undefined}
              aria-current={isActive(item) ? 'page' : undefined}
            >
              <Icon icon={item.icon} size="sm" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="web-sidebar-bottom">
          <div className="web-side-actions">
            <Link href="/me/notifications" aria-label="通知" className="web-icon-btn">
              <Icon icon={Bell} size="sm" />
            </Link>
            <button type="button" onClick={toggleTheme} aria-label={isDark ? '切换到浅色' : '切换到深色'} className="web-icon-btn">
              <Icon icon={isDark ? Sun : Moon} size="sm" />
            </button>
            <Link href="/me/settings" aria-label="设置" className="web-icon-btn">
              <Icon icon={Settings} size="sm" />
            </Link>
          </div>

          <Link href="/me" className="web-mini-profile">
            <span className="web-avatar">{(username || '甜')[0]}</span>
            <span>
              <b>{username || '旅行收藏家'}</b>
              <small>记录每一次出发</small>
            </span>
          </Link>

          <button type="button" onClick={handleLogout} className="web-logout">
            <Icon icon={LogOut} size="sm" />
            退出登录
          </button>
        </div>
      </aside>

      <div className="web-content-offset">{children}</div>
    </>
  )
}
