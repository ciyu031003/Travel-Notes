'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Home, LogOut } from 'lucide-react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (pathname === '/admin/login' || pathname === '/admin/change-password' || pathname === '/admin/setup') {
      return
    }

    const checkStatus = async () => {
      try {
        const res = await fetch('/api/admin/check')
        if (res.ok) {
          const data = await res.json()
          if (!data.authenticated) {
            router.push('/admin/login')
          } else if (data.requirePasswordChange) {
            router.push('/admin/change-password')
          }
        } else {
          router.push('/admin/login')
        }
      } catch {
        router.push('/admin/login')
      }
    }

    checkStatus()
  }, [pathname, router])

  const showNav = !['/admin/login', '/admin/change-password', '/admin/setup'].includes(pathname)

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  return (
    <>
      {showNav && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-white dark:bg-gray-800 shadow-lg rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700">
          <Link
            href="/"
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="在新标签页打开首页"
          >
            <Home className="w-4 h-4" />
            回到首页
          </Link>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-600" />
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            title="退出登录"
          >
            <LogOut className="w-4 h-4" />
            退出
          </button>
        </div>
      )}
      {children}
    </>
  )
}
