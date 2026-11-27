'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { hapticLight } from '@/lib/mobile/haptics'

/**
 * 书页的按压手势：长按放大预览 + 3D tilt（2026-11-28 · U3）
 * ---------------------------------------------------------------------------
 * 只用 pointer 事件接管，位移全部写进 CSS 变量 / 类名（**不动 React state**），
 * 因为 pointermove 每帧都可能触发，setState 会把翻页动画挤掉帧。
 *
 * 长按放大：按住 420ms 不动，整本书以**按点为原点** scale 1.62（CSS transform：
 * scale + transform-origin，纯合成层动画，不触发重排）；松手/取消/Esc 立刻回位。
 * 这是"预览"，不是独立 viewer —— 不打断翻页、不新增一层 DOM、不加载新图。
 *
 * tilt：鼠标在台面上移动时，书朝指针方向微微倾斜（X ≤ 4°、Y ≤ 6°），
 * 离开即回正。触屏不做 tilt（手指本来就挡着画面，倾斜只会晕）。
 *
 * 与「随手划翻页」的关系：两者共享同一批 pointer 事件，但互斥——
 *  · 长按要求位移 < MOVE_TOLERANCE，一旦划动就取消长按并交给翻页手势；
 *  · 放大状态下松手不会误触翻页（BookReader 的翻页判据是位移 ≥ 48px）。
 */

/** 触发长按所需的按住时长 */
const HOLD_MS = 420
/** 按住期间允许的抖动位移；超过即视为"不是长按" */
const MOVE_TOLERANCE = 8
/** 放大倍率 */
const ZOOM_SCALE = 1.62
/** tilt 角度上限（度） */
const TILT_MAX_Y = 6
const TILT_MAX_X = 4
/**
 * 长按放大后，松手时浏览器仍会补一个 click；page-flip 的"点击翻页"会把它当成翻页，
 * 于是"长按看一眼"变成"翻走一页"。这里在捕获阶段吞掉紧随其后的那一次 click，
 * 1s 内没有 click 就自行清理（触屏长按后拖动可能不产生 click）。
 */
function swallowNextClick() {
  if (typeof window === 'undefined') return
  const stop = (ev: Event) => {
    ev.stopPropagation()
    ev.preventDefault()
    cleanup()
  }
  let timer: ReturnType<typeof setTimeout> | null = null
  const cleanup = () => {
    window.removeEventListener('click', stop, true)
    if (timer) clearTimeout(timer)
    timer = null
  }
  window.addEventListener('click', stop, true)
  timer = setTimeout(cleanup, 1000)
}

export function usePressZoom({
  rigRef,
  enabled,
  reduced,
}: {
  rigRef: RefObject<HTMLElement | null>
  /** reduced 档 / reduced-motion 时传 false：不做 tilt、不做放大 */
  enabled: boolean
  /** 只看 prefers-reduced-motion：放大本身是"位移"，要退化 */
  reduced: boolean
}) {
  const [zoomed, setZoomed] = useState(false)
  const pressRef = useRef<{ id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null)
  const zoomedRef = useRef(false)
  const tiltRafRef = useRef<number | null>(null)
  const tiltPointRef = useRef<{ x: number; y: number } | null>(null)

  const applyZoom = useCallback(
    (on: boolean, point?: { x: number; y: number }) => {
      const rig = rigRef.current
      if (!rig) return
      if (on) {
        if (point) {
          rig.style.setProperty('--zoom-ox', point.x + '%')
          rig.style.setProperty('--zoom-oy', point.y + '%')
        }
        rig.style.setProperty('--zoom-scale', String(ZOOM_SCALE))
        rig.classList.add('is-zoomed')
        rig.classList.remove('is-tilting')
      } else {
        rig.classList.remove('is-zoomed')
      }
      zoomedRef.current = on
      setZoomed(on)
    },
    [rigRef],
  )

  const clearTilt = useCallback(() => {
    const rig = rigRef.current
    if (!rig) return
    rig.classList.remove('is-tilting')
    rig.style.removeProperty('--tilt-x')
    rig.style.removeProperty('--tilt-y')
  }, [rigRef])

  /** Esc / 阅读器关闭时强制回位（阅读器会把 Esc 当"关闭"，这里只清视觉态） */
  const reset = useCallback(() => {
    if (pressRef.current) clearTimeout(pressRef.current.timer)
    pressRef.current = null
    if (tiltRafRef.current !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(tiltRafRef.current)
      tiltRafRef.current = null
    }
    clearTilt()
    applyZoom(false)
  }, [applyZoom, clearTilt])

  useEffect(() => () => reset(), [reset])

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || reduced) return
      // 只有主键/单指：多指（缩放系统手势）不接管
      if (e.button !== 0) return
      const rig = rigRef.current
      if (!rig) return
      if (zoomedRef.current) return
      const rect = rig.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const point = {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      }
      const id = e.pointerId
      const x = e.clientX
      const y = e.clientY
      const timer = setTimeout(() => {
        pressRef.current = null
        applyZoom(true, point)
        void hapticLight()
        swallowNextClick()
      }, HOLD_MS)
      pressRef.current = { id, x, y, timer }
    },
    [applyZoom, enabled, reduced, rigRef],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const press = pressRef.current
      if (press && press.id === e.pointerId) {
        // 划动即取消长按（翻页手势接管）
        if (Math.abs(e.clientX - press.x) > MOVE_TOLERANCE || Math.abs(e.clientY - press.y) > MOVE_TOLERANCE) {
          clearTimeout(press.timer)
          pressRef.current = null
        }
        return
      }
      if (!enabled || reduced || zoomedRef.current) return
      if (e.pointerType !== 'mouse') return
      // tilt：一帧最多写一次样式
      tiltPointRef.current = { x: e.clientX, y: e.clientY }
      if (tiltRafRef.current !== null) return
      const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number
      tiltRafRef.current = raf(() => {
        tiltRafRef.current = null
        const rig = rigRef.current
        const point = tiltPointRef.current
        if (!rig || !point) return
        const rect = rig.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        const nx = (point.x - rect.left) / rect.width - 0.5
        const ny = (point.y - rect.top) / rect.height - 0.5
        rig.style.setProperty('--tilt-y', (nx * TILT_MAX_Y * 2).toFixed(2) + 'deg')
        rig.style.setProperty('--tilt-x', (-ny * TILT_MAX_X * 2).toFixed(2) + 'deg')
        rig.classList.add('is-tilting')
      })
    },
    [enabled, reduced, rigRef],
  )

  const endPress = useCallback(() => {
    const press = pressRef.current
    if (press) {
      clearTimeout(press.timer)
      pressRef.current = null
    }
    if (zoomedRef.current) applyZoom(false)
  }, [applyZoom])

  // 接受事件参数但不使用：调用侧可以把同一批 handler 直接绑到 React 的 pointer 事件上
  const onPointerUp = useCallback((e?: ReactPointerEvent<HTMLElement>) => {
    void e
    endPress()
  }, [endPress])
  const onPointerCancel = useCallback((e?: ReactPointerEvent<HTMLElement>) => {
    void e
    endPress()
  }, [endPress])
  const onPointerLeave = useCallback(() => {
    endPress()
    clearTilt()
  }, [clearTilt, endPress])

  /** 长按在触屏/桌面上都可能唤出"存储图片/复制"菜单，按住期间直接吞掉 */
  const onContextMenu = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (zoomedRef.current || pressRef.current) e.preventDefault()
  }, [])

  return { zoomed, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave, onContextMenu, reset }
}
