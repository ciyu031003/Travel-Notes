'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Menu, X, Home, CalendarDays, Sparkles, MapPin, Images, Users, ShieldCheck,
  Settings, LogOut, FileText, Heart,
} from 'lucide-react'

export interface AdminNavItem {
  href: string
  label: string
  icon: any
  color: string
  external?: boolean
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/', label: '回到首页', icon: Home, color: 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700' },
  { href: '/timeline', label: '时间线', icon: CalendarDays, color: 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20' },
  { href: '/admin/moments', label: '碎碎念管理', icon: Sparkles, color: 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20' },
  { href: '/admin/travels', label: '旅行规划', icon: MapPin, color: 'text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20' },
  { href: '/admin/albums', label: '相册管理', icon: Images, color: 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20' },
  { href: '/admin/anniversaries', label: '纪念日管理', icon: Heart, color: 'text-fuchsia-600 dark:text-fuchsia-400 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/20' },
  { href: '/admin/spaces', label: '空间管理', icon: Users, color: 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20' },
  { href: '/admin/audit', label: '审计日志', icon: ShieldCheck, color: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20' },
]

/**
 * 后台统一导航头：
 * - 桌面端：横向导航（xl 以下自动压缩为图标 + 横向滚动）
 * - 移动端：右上角三横线按钮，点击展开全量菜单（时间线/碎碎念等）
 */
export default function AdminHeader({
  title = '后台管理',
  accent = 'from-primary-500 to-purple-500',
}: {
  title?: string
  accent?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  const handleLogout = async () => {
    close()
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    if (href === '/timeline') return pathname === '/timeline' || pathname.startsWith('/timeline')
    if (href.startsWith('/admin')) return pathname === href || pathname.startsWith(href + '/')
    return pathname.startsWith(href)
  }

  return (
    <header className="bg-white/85 dark:bg-gray-800/85 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 backdrop-blur-md">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 h-16">
          {/* 左：logo + 标题 */}
          <div className="flex items-center gap-3 shrink-0 min-w-0">
            <div className={`w-9 h-9 bg-gradient-to-r ${accent} rounded-lg flex items-center justify-center shadow-sm shrink-0`}>
              <FileText className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white truncate">{title}</h1>
          </div>

          {/* 中：桌面导航（lg 显示，xl 以下可横向滚动） */}
          <nav className="hidden lg:flex flex-1 items-center justify-center gap-1.5 xl:gap-2.5 min-w-0 overflow-x-auto scrollbar-hide">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  {...(item.href === '/' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className={`inline-flex items-center gap-1.5 px-2.5 xl:px-3 py-2 text-xs xl:text-sm rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    active ? `${item.color} bg-gray-100 dark:bg-gray-700/60 font-medium` : item.color
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden xl:inline">{item.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* 右：账号设置 + 退出（桌面）+ 三横线（移动） */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <div className="hidden md:flex items-center gap-2">
              <Link
                href="/admin/settings"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors whitespace-nowrap text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden lg:inline">账号设置</span>
              </Link>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors whitespace-nowrap"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden lg:inline">退出登录</span>
              </button>
            </div>

            {/* 三横线汉堡按钮（移动端） */}
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-label={open ? '关闭菜单' : '打开菜单'}
              aria-expanded={open}
              className="md:hidden flex h-10 w-10 items-center justify-center rounded-xl text-gray-700 dark:text-gray-200 transition-all hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[70] md:hidden"
          style={{ background: 'rgba(10, 12, 18, 0.6)' }}
          onClick={close}
          aria-hidden={!open}
        >
          {/* 半透明遮罩层上的模糊层 */}
          <div className="absolute inset-0 backdrop-blur-[2px]" />

          {/* 抽屉面板：实底 + 自身毛玻璃，独立于头部 */}
          <div
            className={`absolute right-0 top-0 h-full w-[min(86vw,340px)] bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl shadow-2xl shadow-black/30 ring-1 ring-black/5 dark:ring-white/10 transition-transform duration-300 ease-out ${
              open ? 'translate-x-0' : 'translate-x-full'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 h-16 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 bg-gradient-to-r ${accent} rounded-lg flex items-center justify-center shadow-md`}>
                  <Heart className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-gray-900 dark:text-white">甜途 · {title}</span>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="关闭菜单"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="p-3 overflow-y-auto max-h-[calc(100vh-4rem)]">
              {ADMIN_NAV.map((item, i) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    style={{ transitionDelay: `${open ? i * 30 : 0}ms` }}
                    className={`mt-1 flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                      active
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                    } ${
                      open ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-500" />}
                  </Link>
                )
              })}

              <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                <Link
                  href="/admin/settings"
                  onClick={close}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  账号设置
                </Link>
                <button
                  onClick={handleLogout}
                  className="mt-1 flex w-full items-center gap-3 px-3 py-3 rounded-xl text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  退出登录
                </button>
              </div>
            </nav>
          </div>
        </div>,
        document.body
      )}
    </header>
  )
}
