'use client'

/**
 * Switch Button —— 来自 shadcn 注册表 \`@kokonutui/switch-button\` 的适配版。
 *
 * 原版就是一个「浅色 / 深色」主题开关（点击时太阳被月亮"咬"一口、射线收回，
 * 主题以圆心扩散的方式切换）。甜途本来就有一套**真实**的明暗主题状态
 * （\`html.dark\` + \`localStorage.theme\`，见 app/layout.tsx 的首屏内联脚本、
 * components/layout/Navbar.tsx、components/social/SocialThemeToggle.tsx），
 * 所以这个组件在这里不是摆设，而是那个全局状态的另一个入口 ——
 * 写的是同一个 key、同一份 class，切换后全站配色与 theme-color 一起变。
 *
 * 相对原版的改动：
 *  1. **中文文案**：「Light / Dark」换成「浅色 / 深夜」，与甜途的用语一致。
 *  2. **设计系统 token**：原版硬编码 zinc / white，这里改成 \`--m-*\` token，
 *     深色模式、主题色变化都会自动跟随；组件内没有裸 hex/rgba。
 *  3. **语义与触控**：\`role="switch" + aria-checked\`（和 components/mobile/Switch 一致），
 *     default/lg 两档最小高度 ≥ 44px，满足移动端触控目标。
 *  4. **动效尊重 prefers-reduced-motion**：减少动效时不做射线/咬口动画，也不做圆形扩散
 *     （View Transitions 分支直接跳过），只瞬时换色。
 *
 * 用法（/me/settings 的「外观」）：
 *   <SwitchButton
 *     theme={dark ? 'dark' : 'light'}
 *     onThemeChange={(next) => { ...写 localStorage + 触觉... }}
 *   />
 * 不传 theme/onThemeChange 时退化成原行为：自己切换 <html> 的 dark class。
 */

import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { cn } from '@/lib/utils'

type Theme = 'light' | 'dark'

interface SwitchButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'default' | 'lg'
  /** 图标旁边显示「浅色 / 深夜」当前态文字 */
  showLabel?: boolean
  /**
   * 由主题提供方持有的当前主题（甜途就是 \`html.dark\`）。
   * 传了它就要配 onThemeChange —— 组件只负责"请求切换"。
   */
  theme?: Theme
  /** 拿到用户想切换到的主题 */
  onThemeChange?: (theme: Theme) => void
  /** 是否用圆形扩散转场（View Transitions API）。false = 瞬时切换 */
  reveal?: boolean
}

const SIZES = {
  // 移动端触控目标 ≥ 44px：default / lg 两档的最小高度都按 44 / 48 给
  sm: { button: 'h-8 gap-1.5 px-2.5 text-[13px]', square: 'w-8', icon: 14 },
  default: { button: 'min-h-11 gap-2 px-3 text-[13px]', square: 'w-11', icon: 16 },
  lg: { button: 'min-h-12 gap-2 px-4 text-[15px]', square: 'w-12', icon: 18 },
} as const

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)'
const EASE_REVEAL = 'cubic-bezier(0.4, 0, 0.2, 1)'
const REVEAL_ATTR = 'data-theme-reveal'
const REVEAL_STYLE_ID = 'kokonut-theme-reveal'
const REVEAL_CSS = 'html[' + REVEAL_ATTR + ']::view-transition-old(root),html[' + REVEAL_ATTR + ']::view-transition-new(root){animation:none;mix-blend-mode:normal}'

const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]
const RAYS = RAY_ANGLES.map((deg) => {
  const rad = (deg * Math.PI) / 180
  const at = (r: number) => ({
    x: Number((12 + r * Math.cos(rad)).toFixed(2)),
    y: Number((12 + r * Math.sin(rad)).toFixed(2)),
  })
  return { deg, from: at(7.5), to: at(10) }
})

const ANIMATED_PROPS = ['opacity', 'scale', 'translate', 'filter'] as const

type Snapshot = Map<Element, Keyframe>

function snapshot(elements: Element[]): Snapshot {
  const map: Snapshot = new Map()
  for (const el of elements) {
    const style = getComputedStyle(el)
    const frame: Keyframe = { offset: 0 }
    for (const prop of ANIMATED_PROPS) frame[prop] = style.getPropertyValue(prop)
    map.set(el, frame)
    for (const animation of el.getAnimations()) animation.cancel()
  }
  return map
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function ensureRevealStyle() {
  if (document.getElementById(REVEAL_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = REVEAL_STYLE_ID
  style.textContent = REVEAL_CSS
  document.head.appendChild(style)
}

function timing(el: Element, toDark: boolean): KeyframeAnimationOptions {
  const { part, index = '0' } = (el as HTMLElement | SVGElement).dataset
  const i = Number(index)
  switch (part) {
    case 'ray':
      // 射线依次收回；切回浅色时要等月亮先退场
      return { delay: toDark ? i * 18 : 140 + i * 22, duration: 260, easing: EASE_OUT }
    case 'bite':
      return { delay: toDark ? 60 : 0, duration: 380, easing: EASE_IN_OUT }
    case 'disc':
      return { delay: toDark ? 40 : 0, duration: 380, easing: EASE_OUT }
    default:
      return { duration: 240, easing: EASE_OUT }
  }
}

function morph(from: Snapshot, toDark: boolean) {
  if (prefersReducedMotion()) return
  for (const [el, frame] of Array.from(from.entries())) {
    el.animate([frame, {}], { ...timing(el, toDark), fill: 'backwards' })
  }
}

let revealRunning = false

function revealFrom(button: HTMLElement, apply: () => void) {
  const doc = document as Document & { activeViewTransition?: unknown }
  if (
    typeof doc.startViewTransition !== 'function' ||
    prefersReducedMotion() ||
    revealRunning ||
    doc.activeViewTransition
  ) {
    apply()
    return
  }

  const rect = button.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  )
  const root = document.documentElement

  ensureRevealStyle()
  root.setAttribute(REVEAL_ATTR, '')
  revealRunning = true

  let transition: ViewTransition
  try {
    transition = doc.startViewTransition(() => flushSync(apply))
  } catch {
    root.removeAttribute(REVEAL_ATTR)
    revealRunning = false
    apply()
    return
  }

  transition.ready
    .then(() => {
      root.animate(
        {
          clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + radius + 'px at ' + x + 'px ' + y + 'px)'],
        },
        { duration: 500, easing: EASE_REVEAL, pseudoElement: '::view-transition-new(root)' },
      )
    })
    .catch(() => {
      // 被页面跳转等打断：主题已经换了，不用处理
    })

  transition.finished
    .catch(() => {
      // 同上：apply 已经生效
    })
    .finally(() => {
      root.removeAttribute(REVEAL_ATTR)
      revealRunning = false
    })
}

export default function SwitchButton({
  className,
  size = 'default',
  showLabel = true,
  theme,
  onThemeChange,
  reveal = true,
  onClick,
  'aria-label': ariaLabel,
  ...props
}: SwitchButtonProps) {
  const maskId = useId() + '-moon'
  const iconRef = useRef<SVGSVGElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const [observed, setObserved] = useState<Theme | null>(null)

  // 首屏（SSR）不知道当前主题，挂载后再读；随后用 MutationObserver 跟随
  // 其他入口（Navbar / SocialThemeToggle / 首屏内联脚本）的切换。
  useEffect(() => {
    const root = document.documentElement
    const read = () => setObserved(root.classList.contains('dark') ? 'dark' : 'light')
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const current = theme ?? observed
  const isDark = current === 'dark'
  const sizing = SIZES[size]

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e)
    if (e.defaultPrevented) return
    const root = document.documentElement
    const from = theme ?? (root.classList.contains('dark') ? 'dark' : 'light')
    const next: Theme = from === 'dark' ? 'light' : 'dark'
    const button = e.currentTarget

    const apply = () => {
      // tsconfig 的 target 不支持直接迭代 NodeList，先摊平成数组
      const parts = [
        ...Array.from(iconRef.current?.querySelectorAll('[data-part]') ?? []),
        ...Array.from(labelRef.current?.querySelectorAll('[data-part]') ?? []),
      ]
      const before = snapshot(Array.from(parts))
      // 传了 theme 时由提供方负责持久化；这里仍先把 class 打上，
      // 否则圆形扩散的截图会拍在"旧主题"上。提供方随后写入同一个值。
      root.classList.toggle('dark', next === 'dark')
      root.style.colorScheme = next
      onThemeChange?.(next)
      morph(before, next === 'dark')
    }

    if (reveal) revealFrom(button, apply)
    else apply()
  }

  return (
    <button
      // 与 components/mobile/Switch 语义一致：读屏把它当开关而不是普通按钮
      role="switch"
      aria-checked={current ? isDark : undefined}
      aria-label={ariaLabel ?? (isDark ? '切换到浅色模式' : '切换到深夜模式')}
      type="button"
      className={cn(
        'group/switch relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center rounded-full font-medium',
        'border border-[var(--m-line)] bg-[var(--m-surface-solid)] text-[var(--m-text)]',
        'hover:bg-[var(--m-surface-2)] active:bg-[var(--m-surface-2)]',
        'transition-[background-color,border-color,color] duration-150 ease-out',
        'outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--m-bg)]',
        'disabled:pointer-events-none disabled:opacity-50',
        sizing.button,
        !showLabel && cn(sizing.square, 'px-0'),
        className,
      )}
      {...props}
      onClick={handleClick}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none shrink-0 overflow-visible"
        fill="none"
        height={sizing.icon}
        ref={iconRef}
        viewBox="0 0 24 24"
        width={sizing.icon}
      >
        <mask id={maskId}>
          <rect fill="white" height="32" width="32" x="-4" y="-4" />
          <circle
            className="translate-x-[10px] -translate-y-[10px] dark:translate-x-0 dark:translate-y-0"
            cx="17"
            cy="7"
            data-part="bite"
            fill="black"
            r="7.5"
          />
        </mask>
        <g mask={'url(#' + maskId + ')'}>
          <circle
            className="origin-[12px_12px] [transform-box:view-box] dark:scale-[1.8]"
            cx="12"
            cy="12"
            data-part="disc"
            fill="currentColor"
            r="4.75"
          />
        </g>
        <g stroke="currentColor" strokeLinecap="round" strokeWidth="2">
          {RAYS.map((ray, index) => (
            <line
              className="origin-[12px_12px] [transform-box:view-box] dark:scale-50 dark:opacity-0"
              data-index={index}
              data-part="ray"
              key={ray.deg}
              x1={ray.from.x}
              x2={ray.to.x}
              y1={ray.from.y}
              y2={ray.to.y}
            />
          ))}
        </g>
      </svg>
      {showLabel && (
        <span aria-hidden="true" className="grid leading-none" ref={labelRef}>
          <span className="col-start-1 row-start-1 dark:opacity-0 dark:blur-[3px]" data-part="label">
            浅色
          </span>
          <span className="col-start-1 row-start-1 opacity-0 blur-[3px] dark:opacity-100 dark:blur-none" data-part="label">
            深夜
          </span>
        </span>
      )}
    </button>
  )
}
