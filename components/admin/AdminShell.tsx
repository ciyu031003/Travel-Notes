'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Menu, X, Home, CalendarDays, Sparkles, MapPin, Images, Users, ShieldCheck,
  Settings, LogOut, FileText, Heart, ExternalLink, Loader2, MessageCircle, Compass,
} from 'lucide-react'

export interface AdminNavItem {
  href: string
  label: string
  icon: any
  color: string
  external?: boolean
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/admin', label: '文章管理', icon: FileText, color: 'text-travel-accentStrong dark:text-travel-accentSoft' },
  { href: '/admin/moments', label: '碎碎念管理', icon: Sparkles, color: 'text-travel-accent dark:text-travel-accentSoft' },
  { href: '/admin/travels', label: '旅行规划', icon: MapPin, color: 'text-travel-accentSoft dark:text-travel-bloom' },
  { href: '/admin/albums', label: '相册管理', icon: Images, color: 'text-travel-accentSoft dark:text-travel-bloom' },
  { href: '/admin/anniversaries', label: '纪念日管理', icon: Heart, color: 'text-travel-accent dark:text-travel-accentSoft' },
  { href: '/admin/spaces', label: '空间管理', icon: Users, color: 'text-travel-accentSoft dark:text-travel-bloom' },
  { href: '/admin/social', label: '社交管理', icon: MessageCircle, color: 'text-travel-accent dark:text-travel-accentSoft' },
  { href: '/admin/audit', label: '审计日志', icon: ShieldCheck, color: 'text-travel-accentSoft dark:text-travel-bloom' },
  { href: '/timeline', label: '时间线', icon: CalendarDays, color: 'text-travel-accent dark:text-travel-accentSoft' },
  { href: '/', label: '回到首页', icon: Home, color: 'text-travel-ink/60 dark:text-shell-muted' },
]

const PAGE_TITLES: Record<string, string> = {
  '/admin': '文章管理',
  '/admin/new': '新建文章',
  '/admin/edit': '编辑文章',
  '/admin/moments': '碎碎念管理',
  '/admin/travels': '旅行规划',
  '/admin/albums': '相册管理',
  '/admin/anniversaries': '纪念日管理',
  '/admin/audit': '审计日志',
  '/admin/spaces': '空间管理',
  '/admin/social': '社交管理',
  '/admin/settings': '账号设置',
  '/admin/change-password': '修改密码',
  '/admin/setup': '初始化',
}

/**
 * 后台统一外壳：
 * - 桌面端（lg+）：左侧玻璃侧边栏（品牌 / 导航 / 用户卡片）
 * - 移动端：顶栏（标题 + 右上角三横线），抽屉经 Portal 挂 body
 * - 全局暖调毛玻璃皮肤 + 页面入场动效
 */
export default function AdminShell({
  children,
  title,
  accent = 'from-travel-accent to-travel-bloom',
}: {
  children: React.ReactNode
  title?: string
  accent?: string
}) {
  const router = useRouter()
  const pathname = usePathname() || ''
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')

  useEffect(() => {
    fetch('/api/admin/check')
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated && d.username) setUsername(d.username)
      })
      .catch(() => {})
  }, [])

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
    if (href === '/timeline') return pathname === '/timeline'
    if (href.startsWith('/admin')) return pathname === href || pathname.startsWith(href + '/')
    return pathname.startsWith(href)
  }

  const pageTitle =
    title ||
    (pathname.startsWith('/admin/edit')
      ? '编辑文章'
      : PAGE_TITLES[pathname] || PAGE_TITLES['/admin'] || '后台管理')

  const navList = (onClick?: () => void) =>
    ADMIN_NAV.map((item) => {
      const Icon = item.icon
      const active = isActive(item.href)
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onClick}
          {...(item.href === '/' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
            active
              ? 'bg-gradient-to-r from-travel-sakura to-travel-sakura dark:from-travel-accent/15 dark:to-travel-accentSoft/10 text-travel-accentStrong dark:text-travel-accentSoft shadow-sm'
              : 'text-travel-ink/70 dark:text-shell-muted hover:bg-white/70 dark:hover:bg-white/5 hover:text-travel-ink dark:hover:text-[#E8E6E1]'
          }`}
        >
          {active && (
            <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-travel-accentSoft to-travel-accent" />
          )}
          <Icon className={`h-[18px] w-[18px] shrink-0 transition-transform duration-200 ${active ? '' : 'group-hover:scale-110'}`} />
          <span className="truncate">{item.label}</span>
        </Link>
      )
    })

  return (
    <div className="min-h-screen bg-travel-cream text-travel-ink dark:bg-[#0A0A0A] dark:text-[#C9CDD3]">
      {/* ===== 桌面侧边栏 ===== */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-travel-line/40 bg-white/75 dark:border-white/5 dark:bg-shell-bg/85 backdrop-blur-2xl lg:flex">
        {/* 品牌 */}
        <div className="flex h-16 items-center gap-3 border-b border-travel-line/50 dark:border-white/5 px-5">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${accent} shadow-md shadow-travel-accent/20`}>
            <Compass className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-travel-inkStrong dark:text-white">行迹</p>
            <p className="text-[11px] text-travel-ink/50 dark:text-gray-500">旅行记忆空间</p>
          </div>
        </div>

        {/* 导航 */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">{navList()}</nav>

        {/* 用户卡片 */}
        <div className="border-t border-travel-line/50 dark:border-white/5 p-3">
          <div className="flex items-center gap-3 rounded-2xl bg-white/70 dark:bg-white/5 px-3 py-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-travel-accentSoft to-travel-accent text-sm font-bold text-white">
              {(username || '访').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-travel-ink dark:text-gray-100">{username || '加载中...'}</p>
              <Link href="/" target="_blank" className="inline-flex items-center gap-1 text-[11px] text-travel-ink/50 hover:text-travel-accent transition-colors">
                <ExternalLink className="h-3 w-3" /> 查看前台
              </Link>
            </div>
            <button
              onClick={handleLogout}
              title="退出登录"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-travel-ink/50 transition-colors hover:bg-travel-danger/10 hover:text-travel-danger"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ===== 主区域 ===== */}
      <div className="lg:pl-64">
        {/* 移动端顶栏 */}
        <header className="sticky top-0 z-30 border-b border-travel-line/50 bg-white/80 dark:border-white/5 dark:bg-[#0A0A0A]/85 backdrop-blur-2xl lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${accent} shadow-md`}>
                <Compass className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-bold text-travel-inkStrong dark:text-white">{pageTitle}</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="打开菜单"
              aria-expanded={open}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-700 dark:text-gray-200 transition-all hover:bg-black/5 dark:hover:bg-white/10 active:scale-95"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* 移动端/桌面统一内容容器 */}
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      {/* ===== 移动端抽屉（Portal 到 body，避免 backdrop-filter 包含块问题） ===== */}
      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[70] lg:hidden"
          style={{ background: 'rgba(10, 12, 18, 0.6)' }}
          onClick={close}
        >
          <div className="absolute inset-0 backdrop-blur-[2px]" />
          <div
            className={`absolute right-0 top-0 flex h-full w-[min(86vw,340px)] flex-col bg-white/95 dark:bg-shell-bg/95 backdrop-blur-2xl shadow-2xl shadow-black/30 ring-1 ring-black/5 dark:ring-white/10 transition-transform duration-300 ease-out ${
              open ? 'translate-x-0' : 'translate-x-full'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-travel-line/50 px-5 dark:border-white/5 h-16">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${accent}`}>
                  <Compass className="h-4 w-4 text-white" />
                </div>
                <span className="font-semibold text-travel-ink dark:text-white">行迹 · {pageTitle}</span>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="关闭菜单"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3">{navList(close)}</nav>

            <div className="border-t border-travel-line/50 p-3 dark:border-white/5">
              <Link
                href="/admin/settings"
                onClick={close}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-travel-ink/80 dark:text-gray-200 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Settings className="h-4 w-4" />
                账号设置
              </Link>
              <button
                onClick={handleLogout}
                className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-travel-danger dark:text-red-400 transition-colors hover:bg-travel-danger/10 dark:hover:bg-red-500/10"
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export function ShellLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-gray-400">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  )
}



