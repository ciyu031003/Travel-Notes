'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 连翻惯性（2026-11-28 · U3）
 * ---------------------------------------------------------------------------
 * 真书快速连翻时，页会越翻越快、书的重量被"带起来"，松开手才慢慢落定。
 * page-flip 的翻页时长是**运行时活设置**（ArtFlipBook 会把它同步进库的 settings），
 * 所以这里只做两件事：
 *
 *   · 记录最近几次翻页的时间戳，在 RUSH_WINDOW_MS 内翻满 RUSH_THRESHOLD 次
 *     就进入 rushing 态，把翻页时长压到 RUSH_TIME_FACTOR（560 → ~308ms），
 *     并给台面挂 is-rushing（CSS 里是"抬起 + 投影加深 + 高光扫得更快"）；
 *   · 最后一次翻页后 RUSH_HOLD_MS 内没有新翻页就自动退出惯性态。
 *
 * 为什么用时间戳数组而不是"每次翻页 +1 的计数器"：快速连翻的节奏本身不稳定，
 * 固定窗口能保证"停手后 0.6s 就不再算连翻"，不会一路加速下去。
 *
 * reduced-motion / 视觉档 reduced（baseTime 被语义化为 0）时整条逻辑关闭：
 * 不加速、不加类，翻页本来就是直切。
 */

/** 判定连翻的时间窗 */
const RUSH_WINDOW_MS = 620
/** 窗内至少翻几次 */
const RUSH_THRESHOLD = 3
/** 最后一次翻页后保持惯性态多久 */
const RUSH_HOLD_MS = 900
/** 惯性态下的翻页时长系数 */
const RUSH_TIME_FACTOR = 0.55
/** 加速后的下限：再快就看不清是一页页翻过去的了 */
const MIN_RUSH_FLIPPING_MS = 220

export function useFlipInertia({
  baseTime,
  enabled,
}: {
  /** 视觉档给出的基准翻页时长（ms，0 = 直切） */
  baseTime: number
  /** reduced-motion / reduced 档时传 false：整条惯性逻辑不生效 */
  enabled: boolean
}) {
  const [rushing, setRushing] = useState(false)
  const stampsRef = useRef<number[]>([])
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** 每次真正发起翻页时调用（键盘 / 按钮 / 轻扫三条入口都走它） */
  const noteFlip = useCallback(() => {
    if (!enabled) return
    const now = Date.now()
    const recent = stampsRef.current.filter((t) => now - t <= RUSH_WINDOW_MS)
    recent.push(now)
    stampsRef.current = recent.slice(-8)
    if (recent.length >= RUSH_THRESHOLD) setRushing(true)
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    clearTimerRef.current = setTimeout(() => {
      setRushing(false)
      stampsRef.current = []
    }, RUSH_HOLD_MS)
  }, [enabled])

  // 卸载时清定时器（阅读器随时可能被返回键关掉）
  useEffect(
    () => () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    },
    [],
  )

  const flippingTime = !enabled
    ? baseTime
    : rushing
      ? Math.max(MIN_RUSH_FLIPPING_MS, Math.round(baseTime * RUSH_TIME_FACTOR))
      : baseTime

  return { rushing, flippingTime, noteFlip }
}
