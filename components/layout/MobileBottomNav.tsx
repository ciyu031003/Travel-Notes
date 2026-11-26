'use client'

import { useCallback, useEffect, useRef, type ComponentType } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { NAV_ICON, Plus } from '@/lib/mobile/icon-system'
import { motion, useReducedMotion } from 'motion/react'
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
 *  · 激活态 = 玻璃胶囊指示器（.lg-chip 语言，layoutId 在四槽之间滑过去）
 *    + 图标/文字同时转为樱粉主色；不使用放大/浮起等干扰性动效。
 *  · 44×44 触控下限、aria-current、aria-label 全部保留。
 *
 * 切页体感（移动端性能专项 D，2026-11-21）
 * ---------------------------------------------------------------------------
 * 四个 tab 是最高频的导航（用户反馈「切换页面特别卡」）。框架对 <Link> 的默认预取
 * 只在「链接进入视口」时触发，并且在 data-saver / 弱网（2G）下会被跳过；tab 栏又恰好
 * 常驻视口 → 首屏那一次预取可能错过，首次点 tab 才去拉 chunk + RSC。
 * 这里补两层**意图预取**（intent prefetch，业界通行的 hover/touch-down 提早）：
 *  · onPointerEnter / onPointerDown / onTouchStart / onFocus 触发 router.prefetch
 *    —— 从手指按下到抬手通常 80~150ms，足够把路由 chunk 与 RSC 负载取回；
 *  · 空闲时（requestIdleCallback，降级 setTimeout）把 4 个 tab 预热一遍，
 *    用切页前的空闲算力换切页时的等待。
 * 预取去重（每个 href 只发一次），且只预取、不改变任何导航/激活态逻辑。
 */
/**
 * 「旅程」图标（与最新 Demo 同款）：IconPark 路线图标的原始 48 栅格路径。
 * 之前用的 lucide Route 是"两条曲线 + 两个点"，和 Demo 里带边框的三条路线
 * 完全不是同一个视觉；这里直接内联路径，保证四端图标一致。
 */
function JourneyGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={4.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M42 4H6C4.89543 4 4 4.89543 4 6V42C4 43.1046 4.89543 44 6 44H42C43.1046 44 44 43.1046 44 42V6C44 4.89543 43.1046 4 42 4Z" />
      <path d="M10 22L38 12" />
      <path d="M10 29L38 19" strokeDasharray="2 6" />
      <path d="M10 36L38 26" />
      <path d="M16 19L13 11" />
      <path d="M37 36L34 28" />
    </svg>
  )
}

/**
 * 图标统一走 lib/mobile/icon-system 的语义表（NAV_ICON），不在组件里
 * `import { Home } from 'lucide-react'` —— 那是 token 门禁第 4 条会拦的写法，
 * 也保证同屏图标只有一个事实源。
 */
type NavIcon = (typeof NAV_ICON)[string]

const TABS: { href: string; label: string; icon: NavIcon; glyph?: ComponentType<{ className?: string }> }[] = [
  { href: '/', label: '首页', icon: NAV_ICON.home },
  { href: '/travel', label: '旅程', icon: NAV_ICON.travel, glyph: JourneyGlyph },
  { href: '/circle', label: '旅行圈', icon: NAV_ICON.circle },
  { href: '/me', label: '我的', icon: NAV_ICON.me },
]

/** 空闲调度：requestIdleCallback 不可用时退化为 setTimeout（Safari/WKWebView 无 rIC） */
function onIdle(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const w = window as Window & {
    requestIdleCallback?: (fn: () => void, opts?: { timeout?: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(cb, { timeout: 2500 })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(cb, 1200)
  return () => window.clearTimeout(id)
}

export default function MobileBottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const prefetchedRef = useRef<Set<string>>(new Set())

  const prefetch = useCallback(
    (href: string) => {
      if (prefetchedRef.current.has(href)) return
      prefetchedRef.current.add(href)
      try {
        router.prefetch(href)
      } catch {
        // 预取失败不影响正常导航
      }
    },
    [router],
  )

  /**
   * 首帧后 ~200ms 预热四个 tab（E2，2026-11-23）
   * ---------------------------------------------------------------------------
   * 旧实现只挂 requestIdleCallback(timeout 2500)：rIC 要等主线程真空闲，
   * 低端机首屏长任务排队时实测要 4.6s 才跑（小于 2.5s 的"空闲"根本挤不进来），
   * 用户在这之前点 tab 依然要吃冷启动的 chunk + RSC 往返。
   * 现在改成确定时机：双 rAF（确保这一帧已经画出来）→ 200ms → 立刻预热；
   * 留一个 idle 兜底（prefetch 内部按 href 去重，不会重复发请求）。
   */
  useEffect(() => {
    let idleCleanup = () => {}
    let timer = 0
    let frame = 0
    const warm = () => {
      for (const tab of TABS) prefetch(tab.href)
    }
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        timer = window.setTimeout(() => {
          warm()
          idleCleanup = onIdle(warm)
        }, 200)
      })
    })
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      idleCleanup()
    }
  }, [prefetch])

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const handleRecord = () => {
    void hapticLight()
    openNewTravel(router)
  }

  return (
    <nav className="m2-tabbar m2-tabbar--glass md:hidden" aria-label="移动端主导航">
      {/*
        液态玻璃底（2026-11-27 重做，G2）：从「白色底板 + 磨砂」改成**悬浮玻璃胶囊 + 云朵背景**。
        ---------------------------------------------------------------------------
        三层结构（纯装饰层全部 aria-hidden，点击/焦点仍落在 <Link> 上，导航语义零改动）：
          1. .m2-tabbar-sky         云带 + 晚霞色 —— DOM 先渲染、z-index 更低，是玻璃的"背景内容"；
          2. .m2-tabbar-glass-layer 真实玻璃（blur(26px) saturate(180%) + tint + rim + 内高光 + 大软影）；
          3. .m2-tab-grid           图标/文字/中央「+」，z-index 盖在玻璃之上。
        玻璃层会把它下面已经画好的像素（这层云带 + 从胶囊下滚过的页面内容）再 blur 一次，
        所以看到的是"云在玻璃后面流"，而不是一块半透明色块。
        云带为什么放进 nav 里：nav 是 fixed 浮在页面之上的，只有把云带画在玻璃层**下面**，
        它的像素才会进入玻璃的 backdrop；放在 page 上会被 fixed 层挡住、采不到。

        性能取舍（2026-11-24 4× 降速实测的 rAF 帧间隔，口径沿用）：
          · LiquidGlass 的 SVG 折射（backdrop-filter: url(#…)）：平均 47ms / p95 192ms —— 太大
          · 磨砂 blur：平均 19.5ms / p95 29ms —— 与改造前一致，可接受
        底部导航是**常驻 fixed** 元素，backdrop-filter 每帧都要重采样滚动内容，
        所以整个底部栏只让玻璃层做**一次** blur(26px)（nav 自身已无 backdrop-filter），
        真折射留给分段控件这类小块表面（见 components/ui/liquid-glass）。
        低端机（html.low-end）与 prefers-reduced-transparency 的降级在 app/tabbar-glass.css。
      */}
      {/* 1. 云带 + 晚霞：玻璃背后的"内容"，玻璃 blur 的就是它 */}
      <div aria-hidden="true" className="m2-tabbar-sky">
        <span className="m2-tabbar-cloud lg-cloud-band" />
      </div>
      {/* 2. 玻璃：全 App 唯一带 backdrop-filter 的底部表面 */}
      <div aria-hidden="true" className="m2-tabbar-glass-layer" />
      {/* 3. 内容层：链接、激活胶囊、中央「+」 */}
      <div className="m2-tab-grid">
        {TABS.slice(0, 2).map((item) => (
          <TabItem key={item.href} item={item} active={isActive(item.href)} onIntent={prefetch} />
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
          <TabItem key={item.href} item={item} active={isActive(item.href)} onIntent={prefetch} />
        ))}
      </div>
    </nav>
  )
}

function TabItem({
  item,
  active,
  onIntent,
}: {
  item: { href: string; label: string; icon: NavIcon; glyph?: ComponentType<{ className?: string }> }
  active: boolean
  onIntent: (href: string) => void
}) {
  const Glyph = item.glyph
  const intent = () => onIntent(item.href)
  const reduceMotion = useReducedMotion()
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={() => void hapticLight()}
      onPointerEnter={intent}
      onPointerDown={intent}
      onTouchStart={intent}
      onFocus={intent}
      className={cn('m2-tab-item select-none', active && 'is-active')}
    >
      {/* 激活态玻璃胶囊：layoutId 让它在四个 tab 之间"滑"过去，而不是凭空跳变 */}
      {active && (
        <motion.span
          aria-hidden="true"
          layoutId="m2-tab-active-pill"
          className="m2-tab-pill"
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 460, damping: 40, mass: 0.8 }
          }
        />
      )}
      {Glyph ? <Glyph /> : <Icon icon={item.icon} size="md" />}
      <span>{item.label}</span>
    </Link>
  )
}