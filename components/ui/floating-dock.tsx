'use client'

import { useRef, useState, type ReactNode } from 'react'
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * 悬浮停靠栏（floating dock）—— 来自 shadcn 注册表 `@aceternity/floating-dock` 的适配版。
 *
 * 相对原版的改动（都是为了接进甜途移动端，而不是原样复制）：
 *  1. **不引入 @tabler/icons-react**：原版只为折叠按钮用了 tabler 图标；
 *     这里所有图标都由调用方以 `ReactNode` 传入（甜途用 `@/components/mobile/Icon` + lucide），
 *     于是这套 dock 不绑定任何图标库，也不会给包里多塞 2MB 依赖。
 *  2. **动画只用 motion**（项目已有依赖），并尊重 `prefers-reduced-motion`：
 *     开启「减少动效」时不做缩放/位移/入场动画，只保留颜色与按压反馈。
 *  3. **移动端优先的单一形态**：原版是「md 以上横向放大 dock + 移动端折叠成 FAB」两套。
 *     甜途旅行详情页只在移动端挂载（`useIsMobile` 分支），折叠 FAB 会让
 *     「传照片 / 记花费」两个入口重新藏起来（真机反馈过「上传图片的入口也找不到」），
 *     所以这里合成一套**常驻可见的横向 dock**：图标 + 11px 文字标签，鼠标悬停放大，
 *     触屏按压回弹；每个 item 触控目标 ≥ 44px。
 *  4. **颜色只用设计系统 token**（`--m-*`）：组件内没有裸 hex/rgba，深色模式自动跟随。
 *
 * 用法（旅行详情页）：
 *   <FloatingDock
 *     items={[
 *       { id: 'memory', title: '记一笔', icon: <Icon icon={PenLine} size="md" />, accent: true, onSelect: openComposer },
 *       { id: 'photo', title: '传照片', icon: <Icon icon={ImagePlus} size="md" />, onSelect: openUpload },
 *     ]}
 *   />
 */

export interface FloatingDockItem {
  /** React key，同时用于 A11y 文案兜底 */
  id: string
  /** 标签文字（11px，常驻显示；读屏取 description 优先） */
  title: string
  /** 图标节点。甜途统一传 `<Icon icon={X} size="md" />`，本组件不感知图标库 */
  icon: ReactNode
  /** 点击/回车触发的动作 */
  onSelect?: () => void
  /** 禁用（如「待同步」时所有写操作不可用）；禁用项仍可见，便于用户理解为何不可点 */
  disabled?: boolean
  /** 主操作：实心强调底，用来保留原「记录一笔」按钮的视觉重量 */
  accent?: boolean
  /**
   * 悬停时在图标上方补一句更完整的说明（如「记录一笔回忆」）。
   * 只做视觉提示：读屏的可访问名一律取 title（可见文字），
   * 这样满足 WCAG 2.5.3「可访问名包含可见标签」，不会出现"听到的和看到的不一致"。
   */
  description?: string
}

export interface FloatingDockProps {
  items: FloatingDockItem[]
  /** dock 整体的无障碍名称 */
  label?: string
  className?: string
}

/** 鼠标离 item 中心多远时开始放大（px）。原版是 150；移动端停靠栏更短，收到 120。 */
const MAGNIFY_RANGE = 120
/** 最大放大倍数（原版 40px → 80px 是 2 倍，放在带文字的移动端 dock 上太夸张） */
const MAGNIFY_SCALE = 1.16

export function FloatingDock({ items, label = '快捷操作', className }: FloatingDockProps) {
  // 指针的 pageX：一旦离开 dock 就设为 Infinity，于是所有 item 回落到基准尺寸
  const mouseX = useMotionValue(Infinity)
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      role="toolbar"
      aria-label={label}
      onPointerMove={(event) => {
        // 手指拖动时 pageX 会跳变，别让 dock 在滑动中乱放大
        if (event.pointerType === 'touch') return
        mouseX.set(event.pageX)
      }}
      onPointerLeave={() => mouseX.set(Infinity)}
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.6 }}
      className={cn(
        'pointer-events-auto mx-auto flex w-fit items-center gap-1 rounded-full border border-[var(--m-line)]',
        'bg-[var(--m-surface)] p-1.5 shadow-[var(--m-shadow-l2)] backdrop-blur-xl',
        className,
      )}
    >
      {items.map((item) => (
        <DockAction key={item.id} item={item} mouseX={mouseX} reduceMotion={Boolean(reduceMotion)} />
      ))}
    </motion.div>
  )
}

function DockAction({
  item,
  mouseX,
  reduceMotion,
}: {
  item: FloatingDockItem
  mouseX: MotionValue<number>
  reduceMotion: boolean
}) {
  const ref = useRef<HTMLButtonElement | null>(null)
  const [hovered, setHovered] = useState(false)

  // 指针到本 item 中心的横向距离 → 缩放 / 上浮。原版用宽高弹簧，这里用 transform：
  // 文字标签常驻时改宽高会让整排来回抖动，transform 不动布局。
  const distance = useTransform(mouseX, (pointerX) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box || !Number.isFinite(pointerX)) return MAGNIFY_RANGE
    return pointerX - box.x - box.width / 2
  })
  const scaleTarget = useTransform(distance, [-MAGNIFY_RANGE, 0, MAGNIFY_RANGE], [1, MAGNIFY_SCALE, 1])
  const liftTarget = useTransform(distance, [-MAGNIFY_RANGE, 0, MAGNIFY_RANGE], [0, -4, 0])
  const spring = { mass: 0.1, stiffness: 200, damping: 16 }
  const scale = useSpring(scaleTarget, spring)
  const lift = useSpring(liftTarget, spring)

  const content = (
    <>
      <span className="flex h-[22px] w-[22px] items-center justify-center" aria-hidden="true">
        {item.icon}
      </span>
      <span className="text-[11px] font-medium leading-none">{item.title}</span>
    </>
  )

  const shared = cn(
    'relative flex h-12 min-w-[58px] shrink-0 flex-col items-center justify-center gap-1 rounded-full px-2.5',
    'outline-none transition-colors duration-150',
    'focus-visible:ring-2 focus-visible:ring-[var(--m-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--m-bg)]',
    item.disabled && 'opacity-40',
    item.accent
      ? 'bg-[var(--m-accent-strong)] text-[var(--m-on-accent)]'
      : hovered && !item.disabled
        ? 'bg-[var(--m-surface-2)] text-[var(--m-text)]'
        : 'text-[var(--m-muted)]',
  )

  // 缩放/上浮只挂在 motion 元素上；按压回弹用 whileTap，避免 CSS scale 与 motion 内联 transform 打架
  return (
    <motion.button
      ref={ref}
      type="button"
      disabled={item.disabled}
      onClick={item.onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={reduceMotion ? undefined : { scale, y: lift }}
      whileTap={reduceMotion || item.disabled ? undefined : { scale: 0.9 }}
      className={shared}
    >
      {content}
      {/* 悬停/聚焦时的气泡提示：文字标签已在下方，这里只补充「description」这种更完整的说明 */}
      <AnimatePresence>
        {hovered && item.description && !reduceMotion ? (
          <motion.span
            aria-hidden="true"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2 }}
            transition={{ duration: 0.14 }}
            className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-max max-w-[180px] -translate-x-1/2 rounded-full bg-[var(--m-text)] px-2.5 py-1 text-[11px] font-medium leading-tight text-[var(--m-bg)] shadow-[var(--m-shadow-l1)]"
          >
            {item.description}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.button>
  )
}

export default FloatingDock
