'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Route, Compass, User, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hapticLight } from '@/lib/mobile/haptics'
import { openNewTravel } from '@/lib/mobile/new-travel'
import { Icon } from '@/components/mobile/Icon'

/**
 * 底部导航（甜途 2.0）
 * ---------------------------------------------------------------------------
 * 结构对齐最新 Demo：四个主导航 + 中央「记录」胶囊 FAB（5 槽等分）。
 *  · 中央 FAB 复用既有 openNewTravel（与列表页右上角「新建」同一逻辑），
 *    不新增任何业务能力，只是把最高频入口放到拇指热区。
 *  · 激活态 = 图标 + 文字同时转为樱粉主色，不使用放大/浮起等干扰性动效。
 *  · 44×44 触控下限、aria-current、aria-label 全部保留。
 */
const TABS = [
  { href: '/', label: '首页', icon: Home },
  { href: '/travel', label: '旅程', icon: Route },
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

  const handleRecord = () => {
    void hapticLight()
    openNewTravel(router)
  }

  return (
    <nav className="m2-tabbar md:hidden" aria-label="移动端主导航">
      <div className="m2-tab-grid">
        {TABS.slice(0, 2).map((item) => (
          <TabItem key={item.href} item={item} active={isActive(item.href)} />
        ))}

        <button
          type="button"
          onClick={handleRecord}
          aria-label="开始一段新旅程"
          className="m2-tab-fab-wrap"
        >
          <span className="m2-tab-fab">
            <Icon icon={Plus} size="md" />
          </span>
          <span>出发</span>
        </button>

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
      className={cn('m2-tab-item select-none', active && 'is-active')}
    >
      <Icon icon={item.icon} size="md" />
      <span>{item.label}</span>
    </Link>
  )
}
