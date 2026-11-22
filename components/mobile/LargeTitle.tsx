'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { goBackOrHome } from '@/lib/navigation'
import { Icon } from '@/components/mobile/Icon'
import { ArrowLeft } from '@/lib/mobile/icon-system'
import { hapticLight } from '@/lib/mobile/haptics'

/**
 * 二级 / 三级页统一页头（V6 Editorial Journal）。
 *
 * 结构（自上而下）：
 *   ① 工具行：44×44 圆形玻璃返回键 + trailing 槽（同为 44×44 圆形按钮规格）
 *   ② eyebrow：11px 字距小字（「甜途 · 设置」这类），用 --m-accent-strong
 *   ③ 衬线大标题：--art-serif，32/38（`.m-nav-title`，与 V6 页面标题同源）
 *   ④ muted 副标题：13/19
 *
 * 为什么不再把返回键摆在标题左侧：真机反馈「二级/三级页面顶部文字与图标很粗糙」，
 * 根因之一是返回箭头**没有容器**、且与多行标题按 baseline 对齐 —— 箭头永远贴不到
 * 标题的视觉中线，右侧图标（如主题月亮）却有自己的圆环，三者在同一行里规格各异。
 * V6 参考（09-album / 01-home）里返回键是**独立一行**的 44px 圆形玻璃按钮，
 * 标题因此获得整行宽度，衬线大标题可以完整排开。
 *
 * 滚动折叠（iOS Large Title 签名行为）：标题区滚出视口顶部时，
 * 顶部浮出一条毛玻璃 compact 栏（圆形返回 + 居中小标题 + 0.5px hairline），
 * 全程只动 opacity/transform。判定用 IntersectionObserver 监听哨兵元素，零 scroll 监听。
 * `collapsible={false}` 可按页关闭。
 *
 * 兼容约束（不可破坏，e2e / a11y 依赖）：
 *  · 返回键 aria-label 固定为「返回」（tests/e2e/me-settings-nav.spec.ts）；
 *  · 标题必须是 <h1> 且 accessible name 恰为 title 文案（同上）；
 *  · 折叠栏未展开时 aria-hidden + inert，内部返回键不可 Tab 到（axe aria-hidden-focus）。
 *
 * 注：`trailing` 只保留在文档流中，不复制进折叠栏——复制会产生两个状态独立的活动实例
 * （如 SocialThemeToggle 会互不同步）。
 */
export function LargeTitle({
  title,
  subtitle,
  eyebrow,
  trailing,
  trailingLabel,
  back,
  className,
  collapsible = true,
}: {
  title: string
  /** 副标题：一句克制的说明（13px muted） */
  subtitle?: string
  /** 眉标：11px 字距小字，建议「甜途 · 设置」这类「品牌 · 栏目」结构 */
  eyebrow?: string
  trailing?: ReactNode
  /** trailing 动作的可见文案（如「管理」）；提供时渲染在图标左侧，13px muted */
  trailingLabel?: string
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
    // 有历史就回上一页（保留用户的来路），否则回兜底地址（深链进入时 back() 会离开站点）
    if (typeof back === 'string') goBackOrHome(router, back)
    else goBackOrHome(router)
  }

  const backKey = (place: 'header' | 'collapser') =>
    back ? (
      <button
        type="button"
        onClick={goBack}
        aria-label="返回"
        className={place === 'collapser' ? 'm-nav-icon m-nav-icon-bar' : 'm-nav-icon'}
      >
        <Icon icon={ArrowLeft} size="md" />
      </button>
    ) : null

  const hasBar = Boolean(back || trailing || trailingLabel)

  return (
    <>
      {/* 折叠栏未展开时 aria-hidden：必须同时 inert，否则里面的返回按钮仍可被 Tab/读屏访问
          （axe aria-hidden-focus serious）。视觉不变，只影响可聚焦性。 */}
      <div
        className={cn('m-collapser', collapsed && 'is-collapsed')}
        aria-hidden={!collapsed}
        inert={!collapsed}
      >
        {backKey('collapser') ?? <span aria-hidden="true" />}
        <span className="m-collapser-title truncate">{title}</span>
        <span aria-hidden="true" />
      </div>
      <header className={cn('m-nav-header', className)}>
        {hasBar && (
          <div className="m-nav-bar">
            {back ? backKey('header') : <span className="m-nav-bar-gap" aria-hidden="true" />}
            {(trailing || trailingLabel) && (
              <div className="m-nav-trailing">
                {trailingLabel ? <span className="m-nav-trailing-label">{trailingLabel}</span> : null}
                {trailing}
              </div>
            )}
          </div>
        )}
        <div className="m-nav-heading">
          {eyebrow ? <p className="m-nav-eyebrow">{eyebrow}</p> : null}
          <h1 className="m-nav-title">{title}</h1>
          {subtitle ? <p className="m-nav-sub">{subtitle}</p> : null}
        </div>
      </header>
      {/* 哨兵放在页头**之后**：标题整块滚出视口顶部才折叠。
          放在页头之前时，短页面（如 /sync 只能滚 74px）会在标题还留在半屏时
          就触发折叠 —— 半透明折叠栏压在大标题上，出现"两个标题"的重影。
          代价是折叠栏晚一点出现，换来任何滚动位置都不会重影。 */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
    </>
  )
}
