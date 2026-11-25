'use client'

import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

/**
 * 画册墙封面卡：可被「手指捏住」的 3D 卡片（T2）
 * ============================================================================
 * 参考 designeer 上「卡片被手指捏住」的手感，落到画册墙的封面卡上：
 *
 *  · 按住拖动 → 卡片跟随指针做 rotateX / rotateY（≤ 10°）+ scale(1.02) + 阴影加深；
 *  · 表面一枚高光/反光条随指针移动（视觉全在 app/mobile.css 的 .album-tilt-sheen；
 *    组件只写 CSS 变量，不碰颜色/渐变，符合「组件里不写裸色值」的硬约束）；
 *  · 松手用欠阻尼弹簧回正（会轻微过冲一下，像卡片弹回墙上）；
 *  · 桌面 hover 只给一半幅度（5°），触屏不做 hover —— 只有按住并横向拖动才响应；
 *  · 纵向手势（|dy| > |dx| × 1.2）直接放弃接管，竖着划列表照常滚动；
 *  · prefers-reduced-motion: reduce 下完全不接管（CSS 侧同时关掉 transform / 高光）。
 *
 * 为什么把「点开画册」也收进这个组件：拖动与点击共用同一个指针手势，
 * 只有总位移 < 6px 才算点击 —— 判定必须在同一处做，否则一次拖拽松手会误开画册。
 * 原按钮上的 prefetchBook / prefetchReader 通过 onPressStart / onHoverStart 原样保留，
 * 画册墙的布局（grid 两列、aspect-ratio 3/4）与 prefetch / openBookByKey 逻辑不变。
 */

/** 拖动时的最大倾角（需求：≤ 10°） */
const DRAG_TILT = 10
/** 桌面 hover 的最大倾角：一半幅度，避免在画册墙上扫一眼就东倒西歪 */
const HOVER_TILT = 5
/** 按住时的放大倍数 */
const HOLD_SCALE = 1.02
/** hover 时的高光浓度（拖动为 1） */
const HOVER_DEPTH = 0.45
/** 超过这个位移就不算点击，松手不再打开画册 */
const CLICK_SLOP = 6
/** 触屏：纵向位移 > 横向位移 × 1.2 视为在滚列表，交还浏览器 */
const SCROLL_RATIO = 1.2
/** 触屏：位移小于这个值时先不判断方向（手指抖动） */
const SLOP = 5

type Vals = { rx: number; ry: number; sc: number; depth: number; sx: number; sy: number }
type Mode = 'idle' | 'hover' | 'drag' | 'settle'

const REST: Vals = { rx: 0, ry: 0, sc: 1, depth: 0, sx: 50, sy: 50 }

const KEYS = ['rx', 'ry', 'sc', 'depth', 'sx', 'sy'] as const
type Key = (typeof KEYS)[number]

const VAR: Record<Key, string> = {
  rx: '--tilt-rx',
  ry: '--tilt-ry',
  sc: '--tilt-scale',
  depth: '--tilt-depth',
  sx: '--tilt-sx',
  sy: '--tilt-sy',
}

/** 收敛阈值：小于它就吸附到目标值并停掉 rAF */
const EPS: Record<Key, number> = {
  rx: 0.02,
  ry: 0.02,
  sc: 0.0004,
  depth: 0.003,
  sx: 0.05,
  sy: 0.05,
}

/**
 * 弹簧参数（刚度 k，单位 1/s²；阻尼 c，单位 1/s）。
 * drag 要跟手（硬、阻尼大），hover 收敛要柔和，settle 欠阻尼才有回弹。
 */
const SPRING: Record<Exclude<Mode, 'idle'>, { k: number; c: number }> = {
  drag: { k: 1300, c: 58 },
  hover: { k: 420, c: 34 },
  settle: { k: 260, c: 14 },
}

const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v)

type Gesture = {
  id: number
  type: string
  startX: number
  startY: number
  /** 本次手势离按下点的最远位移（松手时判定「这是点击还是拖拽」） */
  maxDist: number
  /** 已确认接管（触屏要越过方向判定才为 true） */
  dragging: boolean
  /** 方向/接管已经判定过，不再重复判定 */
  decided: boolean
  /** 判定为纵向手势、已把这次拖动交还给列表滚动 */
  abandoned: boolean
  captured: boolean
}

export default function TiltCoverCard({
  className,
  ariaLabel,
  onOpen,
  onPressStart,
  onHoverStart,
  children,
}: {
  className?: string
  ariaLabel: string
  /** 真正的「打开画册」：只有位移 < 6px 的点击才会走到这里 */
  onOpen: () => void
  /** 指针按下瞬间：上层用来做意图预取（prefetchBook + prefetchReader） */
  onPressStart?: () => void
  /** 指针进入卡片：上层用来预热阅读器代码块（prefetchReader） */
  onHoverStart?: () => void
  children: ReactNode
}) {
  const cardRef = useRef<HTMLButtonElement | null>(null)
  /** 是否 prefers-reduced-motion: reduce（为 true 时完全不接管手势） */
  const reducedRef = useRef(false)

  const curRef = useRef<Vals>({ ...REST })
  const velRef = useRef<Vals>({ ...REST })
  const tgtRef = useRef<Vals>({ ...REST })
  const rafRef = useRef(0)
  const lastTsRef = useRef(0)
  const modeRef = useRef<Mode>('idle')
  const gestureRef = useRef<Gesture | null>(null)
  const suppressClickRef = useRef(false)

  /** 把当前弹簧值写进 CSS 变量（视觉全在 .album-tilt-card / .album-tilt-sheen） */
  const paint = useCallback((v: Vals) => {
    const el = cardRef.current
    if (!el) return
    for (const key of KEYS) {
      const value = v[key]
      const text =
        key === 'rx' || key === 'ry'
          ? value.toFixed(2) + 'deg'
          : key === 'sx' || key === 'sy'
            ? value.toFixed(2) + '%'
            : value.toFixed(4)
      el.style.setProperty(VAR[key], text)
    }
    // 抬起时提到相邻卡片之上（3D 倾斜会压到隔壁，栅格内用 z-index 解决）
    el.classList.toggle('is-held', v.depth > 0.02)
  }, [])

  const tick = useCallback(
    (now: number) => {
      const el = cardRef.current
      if (!el) {
        rafRef.current = 0
        return
      }
      const prev = lastTsRef.current || now
      const dt = clamp((now - prev) / 1000, 1 / 240, 1 / 24)
      lastTsRef.current = now
      const mode = modeRef.current
      const spring = SPRING[mode === 'idle' ? 'settle' : mode]
      const cur = curRef.current
      const vel = velRef.current
      const tgt = tgtRef.current

      // 固定子步积分：k≈1300 时一帧一步的显式积分会发散，按 120Hz 拆步稳定
      let left = dt
      while (left > 0) {
        const h = Math.min(1 / 120, left)
        left -= h
        const drag = Math.exp(-spring.c * h)
        for (const key of KEYS) {
          vel[key] = (vel[key] + (tgt[key] - cur[key]) * spring.k * h) * drag
          cur[key] += vel[key] * h
        }
      }

      let moving = false
      for (const key of KEYS) {
        if (Math.abs(tgt[key] - cur[key]) > EPS[key] || Math.abs(vel[key]) > EPS[key] * 12) {
          moving = true
          break
        }
      }
      if (!moving) {
        for (const key of KEYS) {
          cur[key] = tgt[key]
          vel[key] = 0
        }
        paint(cur)
        rafRef.current = 0
        lastTsRef.current = 0
        if (modeRef.current === 'settle') modeRef.current = 'idle'
        return
      }
      paint(cur)
      rafRef.current = requestAnimationFrame(tick)
    },
    [paint],
  )

  const startLoop = useCallback(() => {
    if (rafRef.current) return
    lastTsRef.current = 0
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  /**
   * 根据指针在卡片内的相对位置设定目标值：指针捏住哪一角，那一角就朝观察者翘起
   * （像把贴在墙上的封面抠起来一点），对角则往里退。
   * CSS 右手系里：rotateY(+) 把右边缘推远、rotateX(+) 把上边缘推远、下边缘拉近，
   * 所以指针偏右 → ry 取负（右缘变近），指针偏下 → rx 取正（下缘变近）。
   */
  const aim = useCallback(
    (clientX: number, clientY: number, tilt: number, scale: number, depth: number) => {
      const el = cardRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const nx = clamp((clientX - rect.left) / rect.width, 0, 1)
      const ny = clamp((clientY - rect.top) / rect.height, 0, 1)
      const t = tgtRef.current
      t.rx = (ny * 2 - 1) * tilt
      t.ry = -(nx * 2 - 1) * tilt
      t.sc = scale
      t.depth = depth
      t.sx = nx * 100
      t.sy = ny * 100
      startLoop()
    },
    [startLoop],
  )

  /** 清空卡片上的运行时样式（reduced-motion 打开 / 卸载时用） */
  const reset = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    lastTsRef.current = 0
    Object.assign(curRef.current, REST)
    Object.assign(velRef.current, REST)
    Object.assign(tgtRef.current, REST)
    const el = cardRef.current
    if (!el) return
    for (const key of KEYS) el.style.removeProperty(VAR[key])
    el.classList.remove('is-held')
  }, [])

  /** 交给弹簧回正 */
  const settle = useCallback(() => {
    Object.assign(tgtRef.current, REST)
    modeRef.current = 'settle'
    startLoop()
  }, [startLoop])

  // 跟随系统的「减少动态效果」：模拟媒体查询也可能在运行中切换
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      reducedRef.current = mq.matches
      if (mq.matches) {
        gestureRef.current = null
        reset()
      }
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [reset])

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (reducedRef.current) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const active = gestureRef.current
    // 另一根手指还在按：不抢；上一次手势如果没等到 pointerup/cancel（例如被浏览器吞掉），这里兜底丢弃
    if (active && active.id !== e.pointerId) return
    gestureRef.current = null
    suppressClickRef.current = false
    const g: Gesture = {
      id: e.pointerId,
      type: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      maxDist: 0,
      // 鼠标没有滚动冲突，按下即接管；触屏要等方向判定
      dragging: e.pointerType === 'mouse',
      decided: e.pointerType === 'mouse',
      abandoned: false,
      captured: false,
    }
    gestureRef.current = g
    modeRef.current = 'drag'
    if (e.pointerType === 'mouse') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
        g.captured = true
      } catch {
        // 旧 WebView 没有指针捕获：卡片内的移动仍然够用
      }
      aim(e.clientX, e.clientY, DRAG_TILT, HOLD_SCALE, 1)
    }
    onPressStart?.()
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (reducedRef.current) return
    const g = gestureRef.current
    if (!g) {
      // 没有按下的鼠标移动 = hover 轻倾斜（触屏不会走到这里）
      if (e.pointerType === 'mouse') {
        modeRef.current = 'hover'
        aim(e.clientX, e.clientY, HOVER_TILT, 1, HOVER_DEPTH)
      }
      return
    }
    if (g.id !== e.pointerId) return
    if (g.abandoned) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    const dist = Math.hypot(dx, dy)
    if (dist > g.maxDist) g.maxDist = dist

    if (!g.decided) {
      // 触屏/笔：先分辨「在滚列表」还是「在捏卡片」
      if (Math.abs(dy) > Math.abs(dx) * SCROLL_RATIO && Math.abs(dy) > 8) {
        // 纵向手势：彻底放手，一个像素都不吃滚动（手势对象留着，等 pointerup 收尾）
        g.abandoned = true
        g.decided = true
        g.dragging = false
        settle()
        return
      }
      if (dist < SLOP) return
      g.decided = true
      g.dragging = true
    }
    if (!g.dragging) return
    if (!g.captured) {
      try {
        e.currentTarget.setPointerCapture(g.id)
        g.captured = true
      } catch {
        // 忽略
      }
    }
    modeRef.current = 'drag'
    aim(e.clientX, e.clientY, DRAG_TILT, HOLD_SCALE, 1)
  }

  const releaseCapture = (el: HTMLButtonElement, g: Gesture) => {
    if (!g.captured) return
    try {
      el.releasePointerCapture(g.id)
    } catch {
      // 忽略
    }
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const g = gestureRef.current
    if (!g || g.id !== e.pointerId) return
    gestureRef.current = null
    releaseCapture(e.currentTarget, g)
    suppressClickRef.current = g.maxDist >= CLICK_SLOP
    if (e.pointerType === 'mouse') {
      const rect = e.currentTarget.getBoundingClientRect()
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      if (inside) {
        // 鼠标还停在卡上：回到 hover 的轻倾斜，而不是拍平
        modeRef.current = 'hover'
        aim(e.clientX, e.clientY, HOVER_TILT, 1, HOVER_DEPTH)
        return
      }
    }
    settle()
  }

  const handlePointerCancel = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const g = gestureRef.current
    if (!g || g.id !== e.pointerId) return
    gestureRef.current = null
    releaseCapture(e.currentTarget, g)
    suppressClickRef.current = false
    settle()
  }

  const handlePointerLeave = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (gestureRef.current) return
    if (e.pointerType !== 'mouse' || reducedRef.current) return
    settle()
  }

  const handlePointerEnter = (e: ReactPointerEvent<HTMLButtonElement>) => {
    // 与拆出前一致：进入卡片就预热阅读器代码块（触屏也执行，代价只有拉 chunk）
    onHoverStart?.()
    if (e.pointerType !== 'mouse' || reducedRef.current) return
    modeRef.current = 'hover'
    aim(e.clientX, e.clientY, HOVER_TILT, 1, HOVER_DEPTH)
  }

  const handleClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
    // 拖拽松手后浏览器仍会补一次 click：这里吃掉，不要打开画册
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
    onOpen()
  }

  return (
    <button
      ref={cardRef}
      type="button"
      aria-label={ariaLabel}
      className={className ? 'album-tilt-card ' + className : 'album-tilt-card'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      onDragStart={(e) => e.preventDefault()}
    >
      {children}
      <span className="album-tilt-sheen" aria-hidden="true" />
    </button>
  )
}
