'use client'

import { useRef, type ReactNode } from 'react'
import { motion, useInView } from 'motion/react'
import { cn } from '@/lib/utils'
import { SPACE_DUR, SPACE_EASE_OUT, SPACE_IN, spaceStaggerContainer, useSpaceRise } from './space-motion'

/**
 * 空间模块的两个动效原语（U1 体验精修）。
 *
 * 为什么单独抽：详情页有 6 个区块、列表页有两组卡片，如果每个区块自己写
 * `initial/animate`，缓动与位移很快就会出现"这个 10px 那个 16px"的漂移。
 * 这里把「滚入一次就定住」和「列表错峰」固化成一个入口，改节奏只改 space-motion.ts。
 *
 * 无障碍：
 *  · 页面根都套了 <MotionConfig reducedMotion="user"> —— 系统开减动效时
 *    motion 自动跳过 y（位移），只留 opacity 淡入，不需要每个组件写分支；
 *  · 滚入用 `once: true`：滚过一次就保持终态，不重复触发（省掉反复 IO 回调，
 *    也避免用户上下滚动时内容"闪"）；
 *  · 动画元素不拦截点击（motion.div 默认 pointer-events 跟随内容）。
 */
export function SpaceReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  /** 同一屏里出现多块时，用 0.04~0.12 的延迟排出节奏 */
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  // 减动效时位移量为 0（初始位置就等于终态），否则"滚入"会先出现在低 12px 处再跳上来
  const rise = useSpaceRise()
  // margin 给负的底部 8%：元素露出 92% 才触发，避免刚探个头就浮上来
  const inView = useInView(ref, { once: true, margin: '0px 0px -8% 0px' })

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: rise }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: SPACE_DUR.slow, ease: SPACE_EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  )
}

/** 列表容器：子项用 <SpaceStaggerItem> 包一层即可获得 60ms 错峰 */
export function SpaceStagger({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={spaceStaggerContainer(delay)}>
      {children}
    </motion.div>
  )
}

/** 错峰子项（只做 opacity + translateY，不改布局属性，列表不会抖） */
export function SpaceStaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const rise = useSpaceRise()
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: rise },
        show: { opacity: 1, y: 0, transition: SPACE_IN },
      }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  )
}
