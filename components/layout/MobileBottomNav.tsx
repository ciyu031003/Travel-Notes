'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Route, Compass, User, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hapticLight } from '@/lib/mobile/haptics'
import { openNewTravel } from '@/lib/mobile/new-travel'
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

  // 游客可浏览公开内容，但记录旅行需先登录（M0 产品规则）。
  // 与列表页头部的「＋ 新建旅行」共用同一份逻辑，避免两个入口行为漂移。
  const handleRecord = () => openNewTravel(router)

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

        {/*
          中央＋：**必须带可见文字**。
          真机反馈「找不到新建旅行在哪个地方」——此前这里只有一个孤零零的加号，
          用户无法从图标推断它就是"新建旅行"。现在与其它 tab 同构：
          强调色圆钮 + 一行「新建旅行」标签。
          （顺带修掉外层 aria-hidden：里面是可点按钮，隐藏它会让读屏用户完全点不到。）
        */}
        <div className="relative flex h-[52px] flex-col items-center justify-center gap-0.5">
          <button
            type="button"
            onClick={handleRecord}
            aria-label="新建旅行"
            className="m-press flex h-10 w-10 items-center justify-center rounded-full bg-[var(--m-accent)] text-[var(--m-on-accent)] shadow-[var(--m-elev-1)]"
          >
            <Icon icon={Plus} size="md" />
          </button>
          <span className="m-tab-label text-[var(--m-accent-strong)]">新建旅行</span>
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
