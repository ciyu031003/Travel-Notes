'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react'

/**
 * Ink & Ivory 桌面首页的交互小件（全部自包含、零新依赖）：
 *  · usePrefersReducedMotion —— 系统「减少动态效果」，JS 驱动的倾斜/入场直接关掉
 *  · Reveal                  —— 滚动一次性渐入（IntersectionObserver，触发后 disconnect）
 *  · TiltCard                —— 指针驱动的 3D 倾斜（rAF 节流，只写 CSS 变量）
 *  · useIdleMount            —— 重组件推迟到「首帧之后 + 浏览器空闲」再挂载
 *  · Icons                   —— 内联 SVG 图标（本目录不 import lucide-react）
 *
 * 为什么倾斜/扫光写在 CSS：类名/关键帧都在 ink-home.css，组件里不出现裸色值，
 * 也不破坏 scripts/check-design-tokens.mjs 的第 1/3/7 条规则。
 */

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReduced(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mq = window.matchMedia(REDUCED_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore<boolean>(
    subscribeReduced,
    () => (typeof window === 'undefined' ? false : window.matchMedia(REDUCED_QUERY).matches),
    () => false,
  )
}

/** 进入视口一次即鸣谢（once）：触发后立刻断开监听，滚动时零开销。 */
export function useInViewOnce<T extends HTMLElement>(threshold = 0.16) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (inView) return
    if (typeof IntersectionObserver !== 'function') {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          io.disconnect()
        }
      },
      { threshold, rootMargin: '0px 0px -6% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [inView, threshold])

  return { ref, inView }
}

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  /** 同屏多块时的错落入场（ms） */
  delay?: number
}) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>()
  const cls = 'wh-reveal' + (inView ? ' is-in' : '') + (className ? ' ' + className : '')
  return (
    <div
      ref={ref}
      className={cls}
      style={delay ? ({ '--wh-reveal-delay': delay + 'ms' } as CSSProperties) : undefined}
    >
      {children}
    </div>
  )
}

/**
 * 3D 倾斜卡片：指针位置 → --wh-rx / --wh-ry / --wh-mx / --wh-my。
 * 只在指针移动时写变量（rAF 合并），离开时复位；reduced-motion 下完全跳过。
 */
export function TiltCard({
  children,
  className,
  max = 5,
}: {
  children: ReactNode
  className?: string
  /** 最大旋转角度（deg） */
  max?: number
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const frame = useRef(0)
  const reduced = usePrefersReducedMotion()

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (reduced) return
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const px = (event.clientX - rect.left) / rect.width
      const py = (event.clientY - rect.top) / rect.height
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        el.style.setProperty('--wh-ry', ((px - 0.5) * max * 2).toFixed(2) + 'deg')
        el.style.setProperty('--wh-rx', ((0.5 - py) * max * 2).toFixed(2) + 'deg')
        el.style.setProperty('--wh-mx', (px * 100).toFixed(1) + '%')
        el.style.setProperty('--wh-my', (py * 100).toFixed(1) + '%')
        el.classList.add('is-tilting')
      })
    },
    [max, reduced],
  )

  const reset = useCallback(() => {
    const el = ref.current
    if (!el) return
    cancelAnimationFrame(frame.current)
    el.style.removeProperty('--wh-rx')
    el.style.removeProperty('--wh-ry')
    el.classList.remove('is-tilting')
  }, [])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  return (
    <div
      ref={ref}
      className={'wh-tilt' + (className ? ' ' + className : '')}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
    >
      {children}
    </div>
  )
}

/**
 * 重组件延迟挂载：首帧之后的空闲帧才真正渲染（地图/图表类不抢首屏带宽与主线程）。
 * idleTimeout 兜底 requestIdleCallback 不存在或长时间不空闲的浏览器。
 */
export function useIdleMount(idleTimeout = 2600): boolean {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    let id = 0
    let timer = 0
    const fire = () => setMounted(true)
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }
    if (typeof win.requestIdleCallback === 'function') {
      id = win.requestIdleCallback(fire, { timeout: idleTimeout })
    } else {
      timer = window.setTimeout(fire, 1800)
    }
    return () => {
      if (id && typeof win.cancelIdleCallback === 'function') win.cancelIdleCallback(id)
      if (timer) window.clearTimeout(timer)
    }
  }, [idleTimeout])

  return mounted
}

/* ── 内联图标（默认 1.5 描边、继承文字色；本目录不 import lucide） ─────────── */

type IconProps = { className?: string }

function iconProps(className?: string) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
    focusable: false,
  }
}

export function IconCompass({ className }: IconProps) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5z" />
    </svg>
  )
}

export function IconAlbum({ className }: IconProps) {
  return (
    <svg {...iconProps(className)}>
      <path d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v13H7.5A2.5 2.5 0 0 1 5 17.5z" />
      <path d="M5 17.5A2.5 2.5 0 0 1 7.5 15H19" />
      <path d="m8.5 12 2.2-2.6 2.1 2.4 1.7-1.9 1.9 2.1" />
    </svg>
  )
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg {...iconProps(className)}>
      <path d="M4.5 12h14" />
      <path d="m13 6.5 5.5 5.5L13 17.5" />
    </svg>
  )
}

export function IconArrowUpRight({ className }: IconProps) {
  return (
    <svg {...iconProps(className)}>
      <path d="M7 17 17 7" />
      <path d="M8.5 7H17v8.5" />
    </svg>
  )
}

export function IconTicket({ className }: IconProps) {
  return (
    <svg {...iconProps(className)}>
      <path d="M3.5 9.5V7a1.5 1.5 0 0 1 1.5-1.5h14A1.5 1.5 0 0 1 20.5 7v2.5a2.5 2.5 0 0 0 0 5V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17v-2.5a2.5 2.5 0 0 0 0-5Z" />
      <path d="M12 7.5v2M12 11v2M12 14.5v2" strokeDasharray="1 3" />
    </svg>
  )
}

export function IconCircle({ className }: IconProps) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.2 14.4c1.2-3.1 2.5-4.6 3.9-4.6 1.2 0 2 1.1 2 2.6 0 1.2-.6 2-1.5 2-.7 0-1.2-.5-1.2-1.2" />
    </svg>
  )
}

export function IconQuote({ className }: IconProps) {
  return (
    <svg {...iconProps(className)}>
      <path d="M9.5 6.5c-2.7.9-4 3-4 5.8v5.2h5.2v-5.2H7.4c.1-1.7.8-2.9 2.1-3.6z" />
      <path d="M19 6.5c-2.7.9-4 3-4 5.8v5.2h5.2v-5.2h-3.3c.1-1.7.8-2.9 2.1-3.6z" />
    </svg>
  )
}

export function IconCalendar({ className }: IconProps) {
  return (
    <svg {...iconProps(className)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
      <path d="M7.5 13.5h2M12 13.5h2M16.5 13.5h.01M7.5 17h2M12 17h2" />
    </svg>
  )
}

export function IconPen({ className }: IconProps) {
  return (
    <svg {...iconProps(className)}>
      <path d="M4 20h4.2L19 9.2a2.3 2.3 0 0 0-3.2-3.2L5 16.8z" />
      <path d="m14.5 7.5 2.8 2.8" />
    </svg>
  )
}

export function IconHeart({ className }: IconProps) {
  return (
    <svg {...iconProps(className)}>
      <path d="M12 19.5s-7.5-4.4-7.5-9.3A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 3c0 4.9-7.5 9.3-7.5 9.3Z" />
    </svg>
  )
}

export function IconSpark({ className }: IconProps) {
  return (
    <svg {...iconProps(className)}>
      <path d="M12 4.5c.6 3.7 2.8 5.9 6.5 6.5-3.7.6-5.9 2.8-6.5 6.5-.6-3.7-2.8-5.9-6.5-6.5 3.7-.6 5.9-2.8 6.5-6.5Z" />
    </svg>
  )
}

export function IconMapPin({ className }: IconProps) {
  return (
    <svg {...iconProps(className)}>
      <path d="M12 21s6.5-5.4 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.6 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.4" />
    </svg>
  )
}
