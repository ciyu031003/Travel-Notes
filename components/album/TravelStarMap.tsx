'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface TravelStarMapCity {
  name: string
  lat: number
  lng: number
  date?: string
  count?: number
}

interface TravelStarMapProps {
  cities: TravelStarMapCity[]
  stats?: { cities?: number; days?: number; photos?: number }
  className?: string
  onSelectCity?: (city: TravelStarMapCity) => void
}

// 中国经纬度范围（与旧 SVG 投影一致）
const LON_MIN = 73
const LON_MAX = 135
const LAT_MIN = 18
const LAT_MAX = 53

// 仿 3D 相机：绕 X 轴俯仰，北侧远离视角，形成「倾斜星盘」的近大远小透视
const TILT = 0.94
const CAMERA_D = 3.6
const BASE_R = 4.5
const MIN_SCALE = 0.45
const MAX_SCALE = 5

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

interface Projected {
  city: TravelStarMapCity
  x: number
  y: number
  s: number
}

/** 经纬度 -> 倾斜星盘上的透视投影（含按照片数的悬浮高度） */
function projectCity(city: TravelStarMapCity, maxCount: number): { x: number; y: number; s: number } {
  const nx = (city.lng - LON_MIN) / (LON_MAX - LON_MIN)
  const ny = (LAT_MAX - city.lat) / (LAT_MAX - LAT_MIN)
  const wx = nx * 2 - 1
  const wy = ny * 2 - 1
  // 悬浮高度：照片越多，星点越「浮起」、越靠近镜头
  const lift = 0.1 + 0.2 * (maxCount > 0 ? clamp((city.count ?? 0) / maxCount, 0, 1) : 0)
  const cosT = Math.cos(TILT)
  const sinT = Math.sin(TILT)
  const y = wy * cosT - lift * sinT
  const z = wy * sinT + lift * cosT
  const depth = CAMERA_D - z
  const s = CAMERA_D / depth
  return { x: wx * s, y: y * s, s }
}

/** 世界坐标 -> 屏幕坐标（含缩放/平移），r 为星点半径 */
function toScreen(p: Projected, W: number, H: number, scale: number, ox: number, oy: number) {
  const k = Math.min(W, H) * 0.44 * scale
  return {
    x: W / 2 + p.x * k + ox,
    y: H / 2 + p.y * k + oy,
    r: clamp(BASE_R * p.s * scale, 2.4, 13),
  }
}

interface Star {
  wx: number
  wy: number
  par: number
  r: number
  alpha: number
  phase: number
}

/** 背景星点：确定性伪随机，避免重渲染跳动；透明度上限 0.5（不喧宾夺主） */
function buildStars(count: number): Star[] {
  const stars: Star[] = []
  let seed = 7
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  for (let i = 0; i < count; i++) {
    stars.push({
      wx: rand() * 3 - 1.5,
      wy: rand() * 2.4 - 1.2,
      par: 0.25 + rand() * 0.35,
      r: 0.4 + rand() * 1.1,
      alpha: 0.08 + rand() * 0.3,
      phase: rand() * Math.PI * 2,
    })
  }
  return stars
}

const STARS = buildStars(110)

/** 城市星点光晕 sprite（预热一次，避免每帧建渐变） */
function getGlow(ref: { current: HTMLCanvasElement | null }): HTMLCanvasElement {
  if (!ref.current) {
    const size = 96
    const cv = document.createElement('canvas')
    cv.width = cv.height = size
    const c = cv.getContext('2d')!
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(232,176,106,0.5)')
    g.addColorStop(0.4, 'rgba(232,176,106,0.16)')
    g.addColorStop(1, 'rgba(232,176,106,0)')
    c.fillStyle = g
    c.fillRect(0, 0, size, size)
    ref.current = cv
  }
  return ref.current
}

export default function TravelStarMap({ cities, stats, className, onSelectCity }: TravelStarMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glowRef = useRef<HTMLCanvasElement | null>(null)

  const [selected, setSelected] = useState<{ city: TravelStarMapCity; x: number; y: number } | null>(null)

  const viewRef = useRef({ scale: 1, ox: 0, oy: 0 })
  const velRef = useRef({ x: 0, y: 0 })
  const reducedMotionRef = useRef(false)
  const selectedNameRef = useRef<string | null>(null)

  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchDistRef = useRef(0)
  const prevMidRef = useRef({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number; moved: number; t: number } | null>(null)
  const lastDragPosRef = useRef<{ x: number; y: number } | null>(null)
  const draggingRef = useRef(false)

  const points: Projected[] = useMemo(() => {
    const valid = cities.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
    const maxCount = Math.max(1, ...valid.map((c) => c.count ?? 0))
    return valid.map((city) => ({ city, ...projectCity(city, maxCount) }))
  }, [cities])

  const draw = useCallback((now: number) => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = wrap.clientWidth
    const H = wrap.clientHeight
    if (W === 0 || H === 0) return
    const bw = Math.round(W * dpr)
    const bh = Math.round(H * dpr)
    if (canvas.width !== bw) canvas.width = bw
    if (canvas.height !== bh) canvas.height = bh
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const { scale, ox, oy } = viewRef.current
    const k = Math.min(W, H) * 0.44
    const selName = selectedNameRef.current

    // 1) 背景星点（视差小，营造纵深；克制，透明度 ≤ 0.5）
    for (const st of STARS) {
      const tw = reducedMotionRef.current ? 0.5 : 0.5 + 0.5 * Math.sin(now * 0.0007 + st.phase)
      const sx = W / 2 + st.wx * k * 1.3 * (1 + (scale - 1) * 0.35) + ox * st.par
      const sy = H / 2 + st.wy * k * 1.3 * (1 + (scale - 1) * 0.35) + oy * st.par
      ctx.globalAlpha = clamp(st.alpha * tw, 0.03, 0.5)
      ctx.fillStyle = '#eef2ff'
      ctx.beginPath()
      ctx.arc(sx, sy, st.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // 2) 星际航线（按时间顺序连线，缓慢流光）
    if (points.length > 1) {
      const pts = points.map((p) => toScreen(p, W, H, scale, ox, oy))
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.strokeStyle = 'rgba(232,176,106,0.10)'
      ctx.lineWidth = 2.5
      ctx.setLineDash([])
      ctx.beginPath()
      pts.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y)))
      ctx.stroke()
      ctx.strokeStyle = 'rgba(232,176,106,0.30)'
      ctx.lineWidth = 1.1
      ctx.setLineDash([3, 7])
      ctx.lineDashOffset = reducedMotionRef.current ? 0 : -(now * 0.006)
      ctx.beginPath()
      pts.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y)))
      ctx.stroke()
      ctx.setLineDash([])
    }

    // 3) 城市星点 + 名称标签
    const glow = getGlow(glowRef)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const p of points) {
      const s = toScreen(p, W, H, scale, ox, oy)
      const isSel = selName === p.city.name
      const gsize = s.r * (isSel ? 5 : 3.4)
      ctx.globalAlpha = isSel ? 0.85 : 0.5
      ctx.drawImage(glow, s.x - gsize / 2, s.y - gsize / 2, gsize, gsize)
      ctx.globalAlpha = 1
      ctx.fillStyle = isSel ? '#f5c97e' : '#e8b06a'
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fill()
      if (isSel) {
        ctx.strokeStyle = 'rgba(245,201,126,0.65)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r + 4, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 0.62
      ctx.fillStyle = '#c9d2e0'
      ctx.font = "11px 'PingFang SC','Microsoft YaHei',sans-serif"
      ctx.fillText(p.city.name, s.x, s.y + s.r + 5)
      ctx.globalAlpha = 1
    }
  }, [points])

  // 渲染循环（含惯性缓动 + 后台暂停）
  useEffect(() => {
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let running = true
    let last = performance.now()

    const tick = (now: number) => {
      if (!running) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!reducedMotionRef.current && !draggingRef.current) {
        const vx = velRef.current.x
        const vy = velRef.current.y
        if (Math.abs(vx) > 0.02 || Math.abs(vy) > 0.02) {
          viewRef.current.ox += vx
          viewRef.current.oy += vy
          velRef.current.x = vx * 0.88
          velRef.current.y = vy * 0.88
        } else {
          velRef.current.x = 0
          velRef.current.y = 0
        }
      }
      draw(now)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onVis = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!running) {
        running = true
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [draw])

  // 手势 / 键鼠事件
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas) return

    const hitTest = (px: number, py: number): Projected | null => {
      if (!wrap) return null
      const W = wrap.clientWidth
      const H = wrap.clientHeight
      const { scale, ox, oy } = viewRef.current
      for (let i = points.length - 1; i >= 0; i--) {
        const s = toScreen(points[i], W, H, scale, ox, oy)
        if (Math.hypot(px - s.x, py - s.y) <= Math.max(s.r + 7, 20)) return points[i]
      }
      return null
    }

    const select = (p: Projected) => {
      selectedNameRef.current = p.city.name
      if (!wrap) {
        setSelected({ city: p.city, x: 0, y: 0 })
        return
      }
      const W = wrap.clientWidth
      const H = wrap.clientHeight
      const s = toScreen(p, W, H, viewRef.current.scale, viewRef.current.ox, viewRef.current.oy)
      const cardX = clamp(s.x, 84, Math.max(84, W - 84))
      const cardY = s.y > 96 ? clamp(s.y - 62, 6, H - 58) : clamp(s.y + 20, 6, H - 58)
      setSelected({ city: p.city, x: cardX, y: cardY })
      onSelectCity?.(p.city)
    }

    const clearSelect = () => {
      selectedNameRef.current = null
      setSelected(null)
    }

    const zoomAt = (px: number, py: number, factor: number) => {
      const next = clamp(viewRef.current.scale * factor, MIN_SCALE, MAX_SCALE)
      const real = next / viewRef.current.scale
      if (real === 1) return
      viewRef.current.ox = px - (px - viewRef.current.ox) * real
      viewRef.current.oy = py - (py - viewRef.current.oy) * real
      viewRef.current.scale = next
    }

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture?.(e.pointerId)
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointersRef.current.size === 1) {
        dragRef.current = { x: e.clientX, y: e.clientY, ox: viewRef.current.ox, oy: viewRef.current.oy, moved: 0, t: performance.now() }
        lastDragPosRef.current = { x: e.clientX, y: e.clientY }
        draggingRef.current = true
        velRef.current = { x: 0, y: 0 }
      } else if (pointersRef.current.size === 2) {
        dragRef.current = null
        draggingRef.current = true
        const pts = Array.from(pointersRef.current.values())
        pinchDistRef.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
        prevMidRef.current = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointersRef.current.size >= 2) {
        const pts = Array.from(pointersRef.current.values())
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
        if (pinchDistRef.current > 0 && dist > 0) {
          const rect = canvas.getBoundingClientRect()
          zoomAt(mid.x - rect.left, mid.y - rect.top, dist / pinchDistRef.current)
          viewRef.current.ox += mid.x - prevMidRef.current.x
          viewRef.current.oy += mid.y - prevMidRef.current.y
        }
        pinchDistRef.current = dist
        prevMidRef.current = mid
        clearSelect()
        return
      }
      const ds = dragRef.current
      if (!ds) return
      const dx = e.clientX - ds.x
      const dy = e.clientY - ds.y
      ds.moved = Math.max(ds.moved, Math.abs(dx) + Math.abs(dy))
      viewRef.current.ox = ds.ox + dx
      viewRef.current.oy = ds.oy + dy
      if (lastDragPosRef.current) {
        velRef.current.x = (e.clientX - lastDragPosRef.current.x) * 0.6
        velRef.current.y = (e.clientY - lastDragPosRef.current.y) * 0.6
      }
      lastDragPosRef.current = { x: e.clientX, y: e.clientY }
      if (ds.moved > 6) clearSelect()
    }

    const onPointerUp = (e: PointerEvent) => {
      pointersRef.current.delete(e.pointerId)
      if (pointersRef.current.size < 2) pinchDistRef.current = 0
      if (pointersRef.current.size === 0) {
        draggingRef.current = false
        const ds = dragRef.current
        if (ds) {
          const dt = performance.now() - ds.t
          if (ds.moved < 6 && dt < 500) {
            const rect = canvas.getBoundingClientRect()
            const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top)
            if (hit) select(hit)
            else clearSelect()
          }
          dragRef.current = null
          lastDragPosRef.current = null
        }
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY > 0 ? 0.88 : 1.14)
      clearSelect()
    }

    const onDblClick = () => {
      viewRef.current = { scale: 1, ox: 0, oy: 0 }
      velRef.current = { x: 0, y: 0 }
      clearSelect()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const cx = (wrap?.clientWidth ?? 0) / 2
      const cy = (wrap?.clientHeight ?? 0) / 2
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(cx, cy, 1.15); clearSelect() }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(cx, cy, 0.87); clearSelect() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); viewRef.current.ox -= 24; clearSelect() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); viewRef.current.ox += 24; clearSelect() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); viewRef.current.oy -= 24; clearSelect() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); viewRef.current.oy += 24; clearSelect() }
      else if (e.key === '0') { e.preventDefault(); viewRef.current = { scale: 1, ox: 0, oy: 0 }; clearSelect() }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('dblclick', onDblClick)
    canvas.addEventListener('keydown', onKeyDown)

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('dblclick', onDblClick)
      canvas.removeEventListener('keydown', onKeyDown)
    }
  }, [points, onSelectCity])

  if (points.length === 0) {
    return (
      <div className={cn('flex min-h-[320px] items-center justify-center rounded-[1.4rem] text-album-text2', className)}>
        还没有可绘制的城市足迹
      </div>
    )
  }

  return (
    <div className={cn('select-none', className)}>
      <div
        ref={wrapRef}
        className="relative h-[min(72vh,620px)] w-full overflow-hidden rounded-[1.4rem] bg-[radial-gradient(60%_60%_at_50%_40%,rgba(40,30,60,0.35),rgba(5,5,8,0)_75%)]"
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="img"
          aria-label="旅行星图（可缩放、平移）"
          className="block h-full w-full touch-none outline-none focus-visible:ring-1 focus-visible:ring-album-accent/40"
        />

        {/* 手势提示 */}
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] tracking-[0.2em] text-album-text3">
          双指缩放 · 拖拽平移 · 双击复位
        </div>

        {/* 选中城市信息卡 */}
        {selected && (
          <div className="pointer-events-none absolute z-10 -translate-x-1/2" style={{ left: selected.x, top: selected.y }}>
            <div className="space-glass rounded-xl px-3 py-2 text-center">
              <div className="text-xs font-bold tracking-widest text-album-text1">{selected.city.name}</div>
              {(selected.city.date || selected.city.count != null) && (
                <div className="mt-1 whitespace-nowrap text-[10px] text-album-text2">
                  {selected.city.date}
                  {selected.city.count != null ? ' · ' + selected.city.count + ' 张' : ''}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {stats && (
        <p className="mt-3 text-center font-zpix text-xs text-album-accent">
          {stats.days !== undefined || stats.photos !== undefined
            ? '我们一起去过 ' + (stats.cities ?? points.length) + ' 城 · ' + (stats.days ?? 0) + ' 天 · ' + (stats.photos ?? 0) + ' 张照片'
            : '我们一起去过 ' + points.length + ' 个城市'}
        </p>
      )}
    </div>
  )
}
