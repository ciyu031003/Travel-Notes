/**
 * 画册翻页运行时参数换算（Album 2.0 优化）
 *
 * 为什么单独成一个纯模块：`page-flip` 2.0.7 的 `getSettings()` 会**直接抛错**拒绝
 * 非法参数 —— 其中 `flippingTime <= 0` 抛 "Invalid flipping time"。
 * 而画册的「视觉档」语义里 reduced 档就是 0（直切，见 BOOK_TIER_PROFILES），
 * 原来的实现把这个语义值原样传进库，于是**任何开启了
 * `prefers-reduced-motion: reduce` 的用户打开画册都会构造失败**，
 * 落到「翻页组件加载失败」兜底（连"重新加载"也救不回来）。
 *
 * 把「语义值 → 库可接受值」的换算收到这里，既修掉这条缺陷，
 * 也让换算规则可以被 node 环境的单测锁死（组件本身含 JSX，vitest 不解析）。
 */

/** 缺省翻页时长（与 M2 收敛后的 standard 档一致） */
export const DEFAULT_FLIPPING_TIME_MS = 560

/**
 * 库要求 flippingTime > 0。「直切」用 1ms 表达：动画在一帧内走完，
 * 肉眼等同瞬时，但不会再触发构造器抛错。
 */
export const INSTANT_FLIPPING_TIME_MS = 1

/** 时长上界：异常配置不该让翻页动到无法阅读 */
export const MAX_FLIPPING_TIME_MS = 2000

/** 翻页阴影最大不透明度（开启阴影时的档位值） */
export const SHADOW_OPACITY_ON = 0.42

/**
 * 视觉档的 flippingTime（语义值，允许 0 = 直切）→ 库可接受的动画时长（恒 > 0）。
 * 非数值走缺省档，避免 NaN 混进库的动画计算。
 */
export function resolveFlippingTime(flippingTime: number | null | undefined): number {
  if (typeof flippingTime !== 'number' || !Number.isFinite(flippingTime)) {
    return DEFAULT_FLIPPING_TIME_MS
  }
  if (flippingTime <= 0) return INSTANT_FLIPPING_TIME_MS
  return Math.min(flippingTime, MAX_FLIPPING_TIME_MS)
}

/**
 * 是否绘制翻页阴影 → 最大不透明度。
 * 关阴影的档位同时把不透明度归零：page-flip 的 `setShadowData()` 已经会因
 * `drawShadow === false` 提前返回，这里是第二道保险（也便于运行时切换档位时立刻生效）。
 */
export function resolveShadowOpacity(drawShadow: boolean | null | undefined): number {
  return drawShadow ? SHADOW_OPACITY_ON : 0
}
