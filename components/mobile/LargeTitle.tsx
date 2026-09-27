'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/mobile/Icon'
import { hapticLight } from '@/lib/mobile/haptics'

/**
 * iOS 大标题：24pt 粗题 + 可选副标题（顶部安全区由页面容器负责）。
 *
 * 滚动折叠（iOS Large Title 签名行为）：标题区滚出视口顶部时，
 * 顶部浮出一条毛玻璃 compact 栏（返回键 + 居中小标题），全程只动 opacity/transform。
 * 折叠判定用 IntersectionObserver 监听标题上沿的哨兵元素，零 scroll 监听。
 * `collapsible={false}` 可按页关闭。
 *
 * `back`（R3 修）：二级页面此前**没有返回按钮** ——
 * 桌面端页头里有一个 `hidden md:flex` 的返回箭头，移动端整块被隐藏（`md:hidden` 的大标题
 * 又没有返回），于是真机上进了「数据与同步 / 我的收藏 / 通知」就只能靠系统返回或底部 tab。
 * 现在大标题自带一个 44×44 的返回键：传 `back` 显示，`back="/me"` 可指定兜底地址
 * （无历史时直接 replace 过去，不会卡在原地）。
 *
 * 注：`trailing` 只保留在文档流中，不复制进折叠栏——复制会产生两个状态独立的活动实例
 * （如 SocialThemeToggle 会互不同步）。
 */
export function LargeTitle({
  title,
  subtitle,
  trailing,
  back,
  className,
  collapsible = true,
}: {
  title: string
  subtitle?: string
  trailing?: ReactNode
  back?: boolean | string
  className?: string
  /** 滚动时是否折叠出毛玻璃小标题栏（默认开） */
  collapsible?: boolean
}) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!collapsible) return
    if (typeof IntersectionObserver === 'undefined') return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setCollapsed(!entry.isIntersecting),
      { rootMargin: '-1px 0px 0px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [collapsible])

  const goBack = () => {
    void hapticLight()
    // 有历史就回上一页（保留用户的来路），否则回兜底地址
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    if (typeof back === 'string') router.replace(back)
  }

  const backKey = (extraClass?: string) =>
    back ? (
      <button
        type="button"
        onClick={goBack}
        aria-label="返回"
        className={cn(
          'm-pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--m-text)]',
          extraClass,
        )}
      >
        <Icon icon={ChevronLeft} size="md" />
      </button>
    ) : null

  return (
    <>
      {/* 哨兵：与标题同位置滚出视口顶部 → 折叠 */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      <div className={cn('m-collapser', collapsed && 'is-collapsed')} aria-hidden={!collapsed}>
        {backKey()}
        <span className="m-collapser-title truncate">{title}</span>
        <span aria-hidden="true" />
      </div>
      <header className={cn('m-title', className)}>
        {back && backKey('-ml-2 h-11 w-11')}
        <div className="min-w-0 flex-1">
          <h1 className="m-title-1 truncate text-[var(--m-text)]">{title}</h1>
          {subtitle && (
            <p className="m-caption mt-1.5 text-[var(--m-muted)]">{subtitle}</p>
          )}
        </div>
        {trailing && <div className="shrink-0">{trailing}</div>}
      </header>
    </>
  )
}
