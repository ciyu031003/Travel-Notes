'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MapPin, Image as ImageIcon, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/', label: '首页', icon: Home },
  { href: '/travel', label: '旅行', icon: MapPin },
  { href: '/album', label: '相册', icon: ImageIcon },
  { href: '/search', label: '搜索', icon: Search },
]

export default function MobileBottomNav() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 pb-[env(safe-area-inset-bottom)]"
      aria-label="移动端导航"
    >
      <div className="grid grid-cols-4">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] transition-colors',
                active
                  ? 'text-[#8B4A5A] dark:text-rose-300'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              )}
            >
              <Icon className={cn('w-5 h-5', active && 'scale-110')} />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
