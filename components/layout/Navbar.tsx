'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, MapPin, CalendarDays, Menu, X, Moon, Sun, Settings, LogOut, Search, Compass, BookOpen } from 'lucide-react'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface NavbarProps {
  variant?: 'default' | 'transparent'
}

export default function Navbar({ variant = 'default' }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/check-auth')
      if (res.ok) {
        const data = await res.json()
        if (data.authenticated) {
          setUsername(data.username)
        }
      }
    } catch {}
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' })
      router.push('/login')
    } catch {
      router.push('/login')
    }
  }

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    // 默认亮色，仅当用户显式选择暗色时进入暗色（与旅行圈/旅行档案主题统一）
    if (saved === 'dark') {
      document.documentElement.classList.add('dark')
      setIsDark(true)
    }
  }, [])

  // 抽屉打开时锁定 body 滚动
  useEffect(() => {
    if (!isMenuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isMenuOpen])

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    } else {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    }
    setIsDark(!isDark)
  }

  const navItems = [
    { href: '/', label: '首页', icon: Home },
    { href: '/travel', label: '旅行记录', icon: MapPin },
    { href: '/album', label: '画册', icon: BookOpen },
    { href: '/circle', label: '旅行圈', icon: Compass },
    { href: '/timeline', label: '时间线', icon: CalendarDays },
  ]

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const isTransparent = variant === 'transparent'
  const useDarkText = isTransparent && !scrolled

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        isTransparent
          ? scrolled
            ? 'bg-white/85 dark:bg-shell-bg/85 backdrop-blur-md border-b border-travel-line/60 dark:border-shell-line'
            : 'bg-transparent'
          : 'bg-white/80 dark:bg-shell-bg/80 backdrop-blur-md border-b border-travel-line/60 dark:border-shell-line'
      )}
    >
      <nav className="container-custom h-16 flex items-center justify-between">
        <Link
          href="/"
          className={cn(
            'font-bold text-xl flex items-center gap-2',
            useDarkText ? '!text-white' : 'text-travel-inkStrong dark:text-shell-text'
          )}
        >
          <span className="w-8 h-8 bg-gradient-to-br from-travel-accent to-travel-bloom rounded-xl flex items-center justify-center shadow-sm">
            <Compass className="w-5 h-5 text-white" />
          </span>
          <span>行迹</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
                isActive(item.href)
                  ? useDarkText
                    ? 'bg-white/20 text-white'
                    : 'bg-travel-sakura/50 text-travel-accentStrong dark:bg-white/10 dark:text-travel-accentSoft'
                  : useDarkText
                    ? 'text-white/70 hover:bg-white/10 hover:text-white'
                    : 'text-travel-ink hover:bg-travel-sakura/30 hover:text-travel-ink dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-white'
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
          <Link
            href="/search"
            className={cn(
              'p-2 rounded-lg transition-colors',
              useDarkText
                ? 'text-white/70 hover:bg-white/10'
                : 'text-travel-ink hover:bg-travel-sakura/30 hover:text-travel-accent dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-white'
            )}
            title="搜索"
          >
            <Search className="w-5 h-5" />
          </Link>
          <button
            onClick={toggleTheme}
            className={cn(
              'p-2 rounded-lg transition-colors ml-2',
              useDarkText
                ? 'text-white/70 hover:bg-white/10'
                : 'text-travel-ink hover:bg-travel-sakura/30 dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-white'
            )}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <Link
            href="/admin"
            className={cn(
              'p-2 rounded-lg transition-colors',
              useDarkText
                ? 'text-white/70 hover:bg-white/10'
                : 'text-travel-ink hover:bg-travel-sakura/30 dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-white'
            )}
            title="管理后台"
          >
            <Settings className="w-5 h-5" />
          </Link>
          {username && (
            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-travel-line/60 dark:border-shell-line">
              <span className={cn(
                'text-sm font-medium',
                useDarkText ? 'text-white' : 'text-travel-inkStrong dark:text-shell-text'
              )}>
                {username}
              </span>
              <button
                onClick={handleLogout}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  useDarkText
                    ? 'text-white/70 hover:bg-white/10'
                    : 'text-travel-ink hover:bg-travel-sakura/30 dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-white'
                )}
                title="退出登录"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/search"
            className={cn(
              'p-2 rounded-lg transition-colors',
              useDarkText
                ? 'text-white/70'
                : 'text-travel-ink hover:bg-travel-sakura/30 hover:text-travel-accent dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-white'
            )}
            title="搜索"
          >
            <Search className="w-5 h-5" />
          </Link>
          <button
            onClick={toggleTheme}
            className={cn(
              'p-2 rounded-lg transition-colors',
              useDarkText
                ? 'text-white/70'
                : 'text-travel-ink hover:bg-travel-sakura/30 dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-white'
            )}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <Link
            href="/admin"
            className={cn(
              'p-2 rounded-lg transition-colors',
              useDarkText
                ? 'text-white/70'
                : 'text-travel-ink hover:bg-travel-sakura/30 dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-white'
            )}
            title="管理后台"
          >
            <Settings className="w-5 h-5" />
          </Link>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              useDarkText
                ? 'text-white/70'
                : 'text-travel-ink hover:bg-travel-sakura/30 dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-white'
            )}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* 移动端全屏抽屉：遮罩 + 当前页高亮（点击遮罩或条目关闭）。
          必须 portal 到 body：header 的 backdrop-blur 会使 fixed 后代相对 header 定位，scrim 会塌成 0 高。 */}
      {isMenuOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="导航菜单">
            {/* 遮罩从导航栏以下开始，条形栏保持可见可关 */}
            <div
              className="absolute inset-x-0 bottom-0 top-16 bg-black/45 backdrop-blur-[2px] motion-safe:animate-[fadeIn_.18s_ease-out]"
              onClick={() => setIsMenuOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute inset-x-0 top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-b-2xl border-t border-travel-line/60 dark:border-shell-line bg-white dark:bg-shell-bg shadow-[0_24px_48px_rgba(0,0,0,0.25)] motion-safe:animate-[menuDrop_.22s_cubic-bezier(0.22,1,0.36,1)]">
            <div className="container-custom py-4 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={cn(
                    'px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-3',
                    isActive(item.href)
                      ? 'bg-travel-sakura/50 text-travel-accentStrong dark:bg-white/10 dark:text-travel-accentSoft'
                      : 'text-travel-ink hover:bg-travel-sakura/30 hover:text-travel-ink dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-white'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              ))}
              <Link
                href="/search"
                onClick={() => setIsMenuOpen(false)}
                aria-current={isActive('/search') ? 'page' : undefined}
                className={cn(
                  'px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-3',
                  isActive('/search')
                    ? 'bg-travel-sakura/50 text-travel-accentStrong dark:bg-white/10 dark:text-travel-accentSoft'
                    : 'text-travel-ink hover:bg-travel-sakura/30 hover:text-travel-ink dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-white'
                )}
              >
                <Search className="w-5 h-5" />
                搜索
              </Link>
              <Link
                href="/admin"
                onClick={() => setIsMenuOpen(false)}
                className="px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 text-travel-ink hover:bg-travel-sakura/30 hover:text-travel-ink dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-white border-t border-travel-line/60 dark:border-shell-line mt-2 pt-3"
              >
                <Settings className="w-5 h-5" />
                管理后台
              </Link>
              {username && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false)
                    handleLogout()
                  }}
                  className="w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 text-travel-danger dark:text-travel-danger hover:bg-travel-danger/10 dark:hover:bg-travel-danger/10"
                >
                  <LogOut className="w-5 h-5" />
                  退出登录 ({username})
                </button>
              )}
            </div>
          </div>
        </div>,
          document.body
        )}
    </header>
  )
}

