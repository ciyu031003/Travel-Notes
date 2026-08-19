'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MapPin, Image as ImageIcon, CalendarDays, Search, Compass } from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/', label: '首页', icon: Home },
  { href: '/travel', label: '旅行', icon: MapPin },
  { href: '/circle', label: '旅行圈', icon: Compass },
  { href: '/timeline', label: '时间线', icon: CalendarDays },
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E8DDD8]/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg dark:border-[#2C343E] dark:bg-[#151A21]/95 md:hidden"
      aria-label="移动端导航"
    >
      <div className="grid grid-cols-6">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-[52px] flex-col items-center justify-center gap-1 text-[11px] transition-colors',
                active
                  ? 'font-medium text-[#A64E61] dark:text-[#E8B8C2]'
                  : 'text-[#6E6A64] hover:text-[#3D4852] dark:text-[#9BA3AE] dark:hover:text-[#E8E6E1]'
              )}
            >
              <Icon className={cn('h-5 w-5', active && 'scale-110')} />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
