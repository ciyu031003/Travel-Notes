'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, MapPin, Image as ImageIcon, Menu, X, Moon, Sun, Settings, LogOut, Heart, Search } from 'lucide-react'
import { useState, useEffect } from 'react'
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
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark')
      setIsDark(true)
    }
  }, [])

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
    { href: '/album', label: '相册', icon: ImageIcon },
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
            ? 'bg-white/85 dark:bg-gray-900/85 backdrop-blur-md border-b border-gray-200 dark:border-gray-800'
            : 'bg-transparent'
          : 'bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800'
      )}
    >
      <nav className="container-custom h-16 flex items-center justify-between">
        <Link
          href="/"
          className={cn(
            'font-bold text-xl flex items-center gap-2',
            useDarkText ? '!text-white' : 'text-[#3D4852]'
          )}
        >
          <span className="w-8 h-8 bg-gradient-to-br from-[#F5DCE0] to-[#E8B8C2] rounded-xl flex items-center justify-center shadow-sm">
            <Heart className="w-4 h-4 text-white fill-white" />
          </span>
          <span>我们的小家</span>
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
                    : 'bg-[#F5DCE0]/50 text-[#8B4A5A]'
                  : useDarkText
                    ? 'text-white/70 hover:bg-white/10 hover:text-white'
                    : 'text-[#4A5560] hover:bg-[#F5DCE0]/30 hover:text-[#3D4852]'
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
                : 'text-[#4A5560] hover:bg-[#F5DCE0]/30 hover:text-primary-500'
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
                : 'text-[#4A5560] hover:bg-[#F5DCE0]/30'
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
                : 'text-[#4A5560] hover:bg-[#F5DCE0]/30'
            )}
            title="管理后台"
          >
            <Settings className="w-5 h-5" />
          </Link>
          {username && (
            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-200 dark:border-gray-700">
              <span className={cn(
                'text-sm font-medium',
                useDarkText ? 'text-white' : 'text-[#3D4852]'
              )}>
                {username}
              </span>
              <button
                onClick={handleLogout}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  useDarkText
                    ? 'text-white/70 hover:bg-white/10'
                    : 'text-[#4A5560] hover:bg-[#F5DCE0]/30'
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
                : 'text-[#4A5560] hover:bg-[#F5DCE0]/30 hover:text-primary-500'
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
                : 'text-[#4A5560] hover:bg-[#F5DCE0]/30'
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
                : 'text-[#4A5560] hover:bg-[#F5DCE0]/30'
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
                : 'text-[#4A5560] hover:bg-[#F5DCE0]/30'
            )}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {isMenuOpen && (
        <div
          className={cn(
            'md:hidden border-t',
            isTransparent
              ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
          )}
        >
          <div className="container-custom py-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMenuOpen(false)}
                className={cn(
                  'px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-3',
                  isActive(item.href)
                    ? 'bg-[#F5DCE0]/50 text-[#8B4A5A]'
                    : 'text-[#4A5560] hover:bg-[#F5DCE0]/30 hover:text-[#3D4852]'
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            ))}
            <Link
              href="/search"
              onClick={() => setIsMenuOpen(false)}
              className="px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 text-[#4A5560] hover:bg-[#F5DCE0]/30 hover:text-[#3D4852]"
            >
              <Search className="w-5 h-5" />
              搜索
            </Link>
            <Link
              href="/admin"
              onClick={() => setIsMenuOpen(false)}
              className="px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 text-[#4A5560] hover:bg-[#F5DCE0]/30 hover:text-[#3D4852] border-t border-gray-200 dark:border-gray-700 mt-2 pt-3"
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
                className="w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <LogOut className="w-5 h-5" />
                退出登录 ({username})
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
