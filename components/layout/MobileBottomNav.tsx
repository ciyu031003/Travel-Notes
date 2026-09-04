'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, MapPin, Compass, User, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/', label: '首页', icon: Home },
  { href: '/travel', label: '旅行', icon: MapPin },
  { href: '/circle', label: '旅行圈', icon: Compass },
  { href: '/me', label: '我的', icon: User },
]

export default function MobileBottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  // 游客可浏览公开内容，但记录旅行需先登录（M0 产品规则）
  const handleRecord = async () => {
    try {
      const res = await fetch('/api/check-auth')
      const data = await res.json().catch(() => null)
      if (data && data.authenticated) {
        router.push('/travel?compose=1')
      } else {
        router.push('/login?redirect=' + encodeURIComponent('/travel?compose=1'))
      }
    } catch {
      router.push('/login?redirect=' + encodeURIComponent('/travel?compose=1'))
    }
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 m-glass pt-[6px] pb-[max(6px,env(safe-area-inset-bottom))] md:hidden"
      style={{ borderTop: '1px solid var(--m-line)', background: 'var(--m-surface)' }}
      aria-label="移动端导航"
    >
      <div className="relative mx-auto grid max-w-md grid-cols-5 items-end">
        {TABS.slice(0, 2).map((item) => (
          <TabItem key={item.href} item={item} active={isActive(item.href)} />
        ))}

        <div className="relative h-[52px]" aria-hidden="true">
          <button
            type="button"
            onClick={handleRecord}
            aria-label="记录旅行"
            className="m-fab absolute bottom-1 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #C67A4E 0%, #A85F3A 60%, #8A4A2B 100%)',
            }}
          >
            <Plus className="h-7 w-7" strokeWidth={2.4} />
          </button>
        </div>

        {TABS.slice(2).map((item) => (
          <TabItem key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </div>
    </nav>
  )
}

function TabItem({
  item,
  active,
}: {
  item: { href: string; label: string; icon: typeof Home }
  active: boolean
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'm-spring relative flex min-h-[52px] flex-col items-center justify-center gap-1 text-[11px] font-medium select-none',
        active ? 'text-[var(--m-accent-strong)]' : 'text-[var(--m-muted)] active:text-[var(--m-text)]'
      )}
    >
      <span className="relative flex h-7 w-7 items-center justify-center">
        <Icon
          className={cn(
            'h-6 w-6 transition-transform duration-300',
            active ? 'scale-110' : 'scale-100'
          )}
          strokeWidth={active ? 2.4 : 2}
        />
        {active && (
          <span
            className="m-tab-active-dot pointer-events-none absolute -inset-1 rounded-2xl"
            style={{ background: 'var(--m-accent-soft)' }}
          />
        )}
      </span>
      <span>{item.label}</span>
    </Link>
  )
}
