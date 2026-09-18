'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/mobile/Icon'
import { hapticLight } from '@/lib/mobile/haptics'

/**
 * iOS 大标题：24pt 粗题 + 可选副标题（顶部安全区由页面容器负责）。
 *
 * `back`（R3 修）：二级页面此前**没有返回按钮** ——
 * 桌面端页头里有一个 `hidden md:flex` 的返回箭头，移动端整块被隐藏（`md:hidden` 的大标题
 * 又没有返回），于是真机上进了「数据与同步 / 我的收藏 / 通知」就只能靠系统返回或底部 tab。
 * 现在大标题自带一个 44×44 的返回键：传 `back` 显示，`back="/me"` 可指定兜底地址
 * （无历史时直接 replace 过去，不会卡在原地）。
 */
export function LargeTitle({
  title,
  subtitle,
  trailing,
  back,
  className,
}: {
  title: string
  subtitle?: string
  trailing?: ReactNode
  /** 显示返回键；传字符串则作为"没有历史时"的兜底地址 */
  back?: boolean | string
  className?: string
}) {
  const router = useRouter()

  const goBack = () => {
    void hapticLight()
    // 有历史就回上一页（保留用户的来路），否则回兜底地址
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    if (typeof back === 'string') router.replace(back)
  }

  return (
    <header className={cn('m-title', className)}>
      {back && (
        <button
          type="button"
          onClick={goBack}
          aria-label="返回"
          className="m-pressable -ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--m-text)]"
        >
          <Icon icon={ChevronLeft} size="md" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="m-title-1 truncate text-[var(--m-text)]">{title}</h1>
        {subtitle && (
          <p className="m-caption mt-1.5 text-[var(--m-muted)]">{subtitle}</p>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </header>
  )
}
