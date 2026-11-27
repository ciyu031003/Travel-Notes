/**
 * 空间模块动效常量（U1 体验精修）。
 *
 * 单一事实源是 CSS 的 `app/motion-tokens.css`（三档时长 + 三条缓动 + 位移/错峰）：
 *   --motion-fast 140ms / --motion-base 220ms / --motion-slow 360ms
 *   --motion-ease-out / -in / -standard，--motion-rise 12px，--motion-stagger 60ms
 *
 * 为什么这里再写一份数字：motion 的 `duration` 只吃秒，读 CSS 变量要
 * getComputedStyle + 水合后才拿得到，首帧会漏动画。两份值必须**同步修改**，
 * 改 token 时把这里一起改（数值一一对应，不是新的一套体系）。
 *
 * 约定（硬约束）：
 *  · 只动 transform / opacity / filter；不动 width / height / top / left；
 *  · 减动效：页面根一律套 <MotionConfig reducedMotion="user">，motion 会自动
 *    跳过位移/缩放，只保留淡入；滚动视差这类"直接写 style"的必须自己判断。
 */
import { useReducedMotion } from 'motion/react'
import type { Transition, Variants } from 'motion/react'

/** 与 --motion-fast/base/slow 对应的秒值 */
export const SPACE_DUR = { fast: 0.14, base: 0.22, slow: 0.36 } as const

/** 与 --motion-ease-out 对应（进场：快起慢收） */
export const SPACE_EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]
/** 与 --motion-ease-standard 对应（位移/缩放） */
export const SPACE_EASE_STANDARD: [number, number, number, number] = [0.2, 0, 0, 1]
/** 与 --motion-rise 对应 */
export const SPACE_RISE = 12
/** 与 --motion-stagger 对应 */
export const SPACE_STAGGER = 0.06

/** 通用进场过渡（淡入 + 微量上浮） */
export const SPACE_IN: Transition = { duration: SPACE_DUR.base, ease: SPACE_EASE_OUT }
/** 区块滚入：比微反馈慢一档，读起来"浮上来"而不是"弹出来" */
export const SPACE_SECTION_IN: Transition = { duration: SPACE_DUR.slow, ease: SPACE_EASE_OUT }

/** 卡片/行错峰的容器：子项按 60ms 依次进入 */
export function spaceStaggerContainer(delayChildren = 0): Variants {
  return {
    hidden: {},
    show: {
      transition: { staggerChildren: SPACE_STAGGER, delayChildren },
    },
  }
}

/** 错峰子项 */
export const SPACE_STAGGER_ITEM: Variants = {
  hidden: { opacity: 0, y: SPACE_RISE },
  show: { opacity: 1, y: 0, transition: SPACE_IN },
}

/**
 * 减动效时的入场位移量：0（只淡入）。
 *
 * 为什么不能只靠 <MotionConfig reducedMotion="user">：MotionConfig 会跳过
 * *动画*，但 motion 仍会把 initial 的 y 写进首帧 —— 对"滚入才出现"的区块来说，
 * 减动效用户滚到它时，元素会先以 +12px 的位置淡入、随后跳回 0。
 * 所以"初始位移"这类静态值必须自己判断，才能做到"无位移、仅淡入"。
 */
export function useSpaceRise(distance: number = SPACE_RISE): number {
  return useReducedMotion() ? 0 : distance
}

/** 单块上浮（Hero 之后的统计条、计划卡等） */
export function spaceRiseIn(distance = SPACE_RISE, delay = 0): Variants {
  return {
    hidden: { opacity: 0, y: distance },
    show: { opacity: 1, y: 0, transition: { ...SPACE_IN, delay } },
  }
}
