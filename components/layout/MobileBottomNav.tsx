'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Route, Compass, User, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiUrl } from '@/lib/api-base'
import { hapticLight } from '@/lib/mobile/haptics'
import { Icon } from '@/components/mobile/Icon'

/**
 * 底部导航（iOS 观感）
 *
 * 本轮修订（P0 图标与色彩收敛）：
 *  · FAB 由三段渐变改为纯强调色 + 静态投影（渐变仅允许用于主 CTA，且不再叠呼吸动画）
 *  · Tab 图标统一 20px / 2px 描边，删除激活态的 scale 放大与模糊圆角块 ——
 *    改用「图标 + 文字同时变色」这一最克制、最接近 iOS 的表达
 *  · 「旅行」Tab 由 MapPin 改为 Route，解除 MapPin 同时表示
 *    「地点 / 省份 / 旅行 / 足迹」四种语义的冲突
 */
const TABS = [
  { href: '/', label: '首页', icon: Home },
  { href: '/travel', label: '旅行', icon: Route },
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
    void hapticLight()
    try {
      const res = await fetch(apiUrl('/api/check-auth'), { credentials: 'include' })
      const data = await res.json().catch(() => null)
      if (data && data.authenticated) {
        router.push('/travel/new')
      } else {
        router.push('/login?redirect=' + encodeURIComponent('/travel/new'))
      }
    } catch {
      router.push('/login?redirect=' + encodeURIComponent('/travel/new'))
    }
  }

  return (
    <nav
      className="m-glass fixed inset-x-0 bottom-0 z-40 pt-[6px] pb-[max(6px,env(safe-area-inset-bottom))] md:hidden"
      style={{ borderTop: '0.5px solid var(--m-line-strong)', background: 'var(--m-surface)' }}
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
            className="m-fab m-press absolute bottom-1 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-[var(--m-accent)] text-white"
          >
            <Icon icon={Plus} size="lg" />
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
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={() => void hapticLight()}
      className={cn(
        'm-pressable relative flex min-h-[52px] flex-col items-center justify-center gap-1 select-none',
        'm-tab-label',
        active ? 'text-[var(--m-accent-strong)]' : 'text-[var(--m-muted)]'
      )}
    >
      <Icon icon={item.icon} size="md" />
      <span>{item.label}</span>
    </Link>
  )
}
