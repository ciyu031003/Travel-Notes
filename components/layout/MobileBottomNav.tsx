'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MapPin, CalendarDays, User, Compass } from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/', label: '首页', icon: Home },
  { href: '/travel', label: '旅行', icon: MapPin },
  { href: '/circle', label: '旅行圈', icon: Compass },
  { href: '/timeline', label: '时间线', icon: CalendarDays },
  { href: '/me', label: '我的', icon: User },
]

export default function MobileBottomNav() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-travel-line/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg dark:border-shell-line dark:bg-shell-surface3/95 md:hidden"
      aria-label="移动端导航"
    >
      <div className="grid grid-cols-5">
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
                  ? 'font-medium text-travel-accent dark:text-travel-bloom'
                  : 'text-travel-ink/70 hover:text-travel-ink dark:text-shell-muted dark:hover:text-[#E8E6E1]'
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
