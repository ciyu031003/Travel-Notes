'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { X } from 'lucide-react'
import { useModalLayer } from '@/hooks/use-modal-layer'
import { markOverlayNavigation } from '@/hooks/use-close-on-back'
import { cn } from '@/lib/utils'
import { MOBILE_OVERLAY_TRANSITION, MOBILE_PANEL_SPRING } from '@/lib/mobile/motion'
import { Icon } from './Icon'
import { IconButton } from './IconButton'

export function SideDrawer({
  open,
  onClose,
  title,
  children,
  className,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
  /** 固定在底部的操作区，例如“退出登录”。 */
  footer?: ReactNode
}) {
  const panelRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useModalLayer({ open: open && mounted, onClose, panelRef })

  if (!mounted) return null

  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[115]" data-modal-layer="side-drawer">
            <motion.button
              type="button"
              aria-label="关闭侧边面板"
              tabIndex={-1}
              onClick={onClose}
              className="m-drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={MOBILE_OVERLAY_TRANSITION}
            />
            {/*
              刻意**不再给面板加 drag**（2026-10-16）。
              此前面板带 drag="x"：即使设了 dragListener={false}，motion 仍会在面板上
              建立手势上下文，先后两版都没能真正解决"抽屉里点击无反应"。
              抽屉本来就有明确的关闭方式（右上角 × 与点遮罩关闭），横滑关闭属锦上添花，
              不值得拿"行内点击可靠"去换 —— 这是真机上最影响可用性的地方。
              BottomSheet 保留 drag（它是从专用把手起拖，且不承载列表项点击）。
            */}
            <motion.aside
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className={cn('m-drawer-panel', className)}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={MOBILE_PANEL_SPRING}
            >
              <header
                className="flex items-center gap-2 px-4 pb-2"
                style={{ paddingTop: 'var(--m-safe-top)' }}
              >
                <h2 id={titleId} className="m-title-2 min-w-0 flex-1 truncate text-[var(--m-text)]">
                  {title}
                </h2>
                <IconButton icon={X} label="关闭" variant="plain" onClick={onClose} />
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>

              {footer && (
                <div
                  className="border-t border-[var(--m-line)] px-4 pt-3"
                  style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
                >
                  {footer}
                </div>
              )}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </MotionConfig>,
    document.body,
  )
}

/** 抽屉里的分组：比页面级列表更紧凑。 */
export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-2">
      <p className="m-label mb-2 px-1 text-[var(--m-faint)]">{title}</p>
      <div className="m-card-flat overflow-hidden divide-y divide-[var(--m-line)]">{children}</div>
    </section>
  )
}

/**
 * 抽屉行：图标 + 标题 + 可选说明与尾部内容。
 *
 * ⚠️ href 必须保持**普通 Next 路由**（`/moments`），不要补 `.html`。
 * 2026-10-17 定论：曾为了绕开 Capacitor html5mode 把 href 改成带 .html，
 * 结果抽屉里**所有**链接都点不动 —— Next 的 <Link> 只对"已知应用路由"做客户端跳转，
 * `/moments.html` 不在路由表里，它既不客户端跳转也不回退原生跳转，静默无反应。
 * 实测（Playwright + 真实静态壳）：正文 <Link href="/moments"> 跳转成功；
 * 抽屉 <Link href="/moments.html"> 无跳转且 0 个网络请求；抽屉普通 <a href="/moments"> 跳转成功。
 * 即原因是 href 本身，与 portal / 容器无关。
 */
export function DrawerRow({
  icon,
  title,
  description,
  trailing,
  onClick,
  href,
}: {
  icon: React.ComponentType<{ size?: 'sm' | 'md' | 'lg'; className?: string }>
  title: string
  description?: string
  trailing?: ReactNode
  onClick?: () => void
  href?: string
}) {
  const router = useRouter()
  const body = (
    <>
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[var(--m-surface-2)] text-[var(--m-muted)]">
        <Icon icon={icon as never} size="sm" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="m-body block truncate font-medium text-[var(--m-text)]">{title}</span>
        {description && (
          <span className="m-caption mt-0.5 block truncate text-[var(--m-muted)]">
            {description}
          </span>
        )}
      </span>
      {trailing}
    </>
  )
  const cls = 'm-pressable flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left'
  if (href) {
    /**
     * 用**原生 <a>** 而不是 next/link（2026-10-17 定论，实测出来的）。
     *
     * 故障：抽屉里所有导航项都点不动 —— 点下去抽屉会关，但页面不跳。
     * 用 Playwright 打开真实静态壳逐项验证，结论如下：
     *   · 正文里的 <Link href="/moments">          → 跳转成功（2 个请求）
     *   · 抽屉里的 <Link href="/moments">          → **无跳转、0 个请求**，
     *     而且事件 defaultPrevented=true —— 说明 Next 的 Link 处理器跑了、
     *     也调了 preventDefault，但路由没有生效。
     *   · 抽屉里的普通 <a href="/moments">         → 跳转成功
     *   · 把 href 从 /moments.html 改回 /moments    → 仍然不行（所以不是 href 的问题）
     *
     * 即：**next/link 在抽屉这个 portal 里不工作**，原生锚点则完全正常。
     * 抽屉是"点一下就离开"的场景，用原生锚点换来**确定可用**，代价仅是一次整页加载，
     * 这个取舍在这里是划算的 —— 之前两轮都是想"保住 SPA 体验"，结果按钮根本点不动。
     */
    return (
      <a
        href={href}
        className={cls}
        onClick={(event) => {
          /**
           * 2026-10-19 真机回归（严重 bug）：半屏抽屉里的所有入口点下去都回到首页。
           *
           * 根因（Capacitor Android WebViewLocalServer.java:425）：
           *   `if (path === "/" || (!lastSegment.includes(".") && html5mode)) serve index.html`
           * —— html5mode 会把**任何无扩展名路径**（/moments、/dashboard、/me/settings…）
           * 都回退成 index.html。用原生 <a> 做整页跳转时，WebView 于是加载首页；
           * 这就是"抽屉里点什么都回首页"的原因（此前误判为 Link 在 portal 里不工作）。
           *
           * 修法：拦截普通左键，走 Next 客户端路由（router.push）。静态导出壳里
           * 客户端路由只请求 `/route.txt`（带扩展名，Capacitor 会命中真实文件），
           * 不触发整页文档请求，因此不再被 html5 回退劫持。
           * 修饰键/中键保留浏览器原生行为（Web 端可在新标签打开）。
           */
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return
          }
          event.preventDefault()
          // 先打导航标记（阻止弹层 cleanup 的 history.back 把新路由顶掉），再关抽屉与导航
          markOverlayNavigation()
          onClick?.()
          /**
           * 用 replace 而不是 push：抽屉打开时 useCloseOnBack 已经压了一条同 URL 历史，
           * replace 正好消费掉它（历史仍是 当前页 → 目标页，返回键回到当前页）；
           * 配合 useCloseOnBack 的「路由已变不再 back」守卫，导航不会被回退顶掉。
           */
          router.replace(href)
        }}
      >
        {body}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  )
}

export default SideDrawer
