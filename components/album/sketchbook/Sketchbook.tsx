'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, X, Plus, Minus, Search, List, Paintbrush } from 'lucide-react'
import type { Book } from '@/components/album/travel-book/TravelBook'
import { buildSpreads, type Spread } from './spreads'
import './sketchbook.css'

type Dir = 'next' | 'prev'

interface TurnState {
  dir: Dir
  from: number
  to: number
  t: number
  strips: HTMLDivElement[]
}

/* 弯曲纸几何（沿用参考站参数） */
const N = 18
const SPAN = 0.449
const BETA = 0.60
/* 书倾斜 / 缩放 */
const TILT_X = 4.5
const TILT_Y = 7
const ZOOM_MIN = 0.9
const ZOOM_MAX = 1.5
/* 放大镜 */
const MAG = 2.3

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
function div(cls: string): HTMLDivElement {
  const e = document.createElement('div')
  e.className = cls
  return e
}

export default function Sketchbook({ book, onBack, onToggleBook }: { book: Book; onBack: () => void; onToggleBook?: () => void }) {
  const spreads = useMemo(() => buildSpreads(book), [book])

  const [idx, setIdx] = useState(0)
  const [sketch, setSketch] = useState(false)
  const [indexOpen, setIndexOpen] = useState(false)
  const [loupeOn, setLoupeOn] = useState(false)
  const [showHint, setShowHint] = useState(true)

  const rootRef = useRef<HTMLDivElement>(null)
  const threeDRef = useRef<HTMLDivElement>(null)
  const tiltRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<HTMLDivElement>(null)
  const loupeRef = useRef<HTMLDivElement>(null)
  const zoomWrapRef = useRef<HTMLDivElement>(null)
  const zoomInnerRef = useRef<HTMLDivElement>(null)
  const zoomReadRef = useRef<HTMLSpanElement>(null)
  const zInRef = useRef<HTMLButtonElement>(null)
  const zOutRef = useRef<HTMLButtonElement>(null)

  const idxRef = useRef(0)
  const turnRef = useRef<TurnState | null>(null)
  const springRef = useRef<any>(null)
  const dragRef = useRef<any>(null)
  const loupeRefState = useRef<any>({ x: null, y: null, grab: null, target: null })
  const viewRef = useRef({ rx: 0, ry: 0, z: 1, trx: 0, try_: 0, tz: 1 })
  const lastZ = useRef(1)
  const rafRef = useRef<number | null>(null)
  const lastTs = useRef(0)
  const reducedRef = useRef(false)
  const hintTimer = useRef<number | null>(null)

  useEffect(() => {
    reducedRef.current = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const hide = () => setShowHint(false)
    hintTimer.current = window.setTimeout(hide, 4200)
    return () => {
      if (hintTimer.current) window.clearTimeout(hintTimer.current)
    }
  }, [])

  /* ---------- 几何 ---------- */
  const bookBox = useCallback(() => {
    const el = bookRef.current
    if (!el) return { w: 0, h: 0 }
    return { w: el.clientWidth, h: el.clientHeight }
  }, [])

  const loupeSize = useCallback(() => {
    return Math.round(Math.max(165, Math.min(262, bookRef.current?.clientWidth ?? 0 * 0.235)))
  }, [])

  /* ---------- 书内容绘制（幂等：每次清空重建） ---------- */
  const paint = useCallback(() => {
    const bookEl = bookRef.current
    if (!bookEl) return
    bookEl.textContent = ''
    const turn = turnRef.current


    const setSketch = (img: HTMLImageElement) => {
      if (sketch) img.classList.add('sk-sketch')
    }

    if (!turn) {
      // 静止整页图版
      const full = div('sk-full')
      const sp = spreads[idxRef.current]
      if (sp) {
        const img = new Image()
        img.src = sp.image
        img.alt = sp.title
        img.draggable = false
        setSketch(img)
        full.appendChild(img)
        if (sp.kind === 'summary') {
          const overlay = div('sk-summary')
          overlay.innerHTML =
            '<div class="sk-sum-kicker">End · 旅行总结</div>' +
            '<div class="sk-sum-title"></div>' +
            '<div class="sk-sum-stats"><div><b></b><span>天数</span></div><div><b></b><span>照片</span></div></div>' +
            '<div class="sk-sum-close">谢谢翻阅，收藏这段路上的时光。</div>'
          overlay.querySelector('.sk-sum-title')!.textContent = sp.title
          const stats = overlay.querySelectorAll('.sk-sum-stats b')
          stats[0].textContent = String(book.dayCount || spreads.length - 2)
          stats[1].textContent = String(sp.count)
          full.appendChild(overlay)
        }
      }
      // 描绘画纸边缘阴影（克制）
      bookEl.style.setProperty('--shade', '0')
      bookEl.appendChild(full)
    } else {
      const next = turn.dir === 'next'
      const fromSp = spreads[turn.from]
      const toSp = spreads[turn.to]
      const half = (pos: 'left' | 'right', sp: Spread) => {
        const h = div('sk-half ' + pos)
        const img = new Image()
        img.src = sp.image
        img.alt = sp.title
        img.draggable = false
        img.className = 'sk-half-img' + (pos === 'right' ? ' right' : '')
        setSketch(img)
        h.appendChild(img)
        h.appendChild(div('sk-gutter-shade ' + pos))
        return h
      }
      if (fromSp) bookEl.appendChild(half('left', next ? fromSp : toSp))
      if (toSp) bookEl.appendChild(half('right', next ? toSp : fromSp))

      const curl = buildCurl(turn, fromSp, toSp)
      bookEl.appendChild(curl)
      applyTurn(turn.t)
    }

    syncZoomLayer()
    placeLoupe()
  }, [sketch, spreads])

  /* ---------- 弯曲纸：嵌套条带 ---------- */
  const buildCurl = (turn: TurnState, fromSp?: Spread, toSp?: Spread) => {
    const c = div('sk-curl ' + turn.dir)
    c.style.setProperty('--n', String(N))
    c.style.setProperty('--span', String(SPAN))
    let host = c as HTMLDivElement
    const strips: HTMLDivElement[] = []
    for (let i = 0; i < N; i++) {
      const s = div('sk-strip')
      s.style.setProperty('--i', String(i))
      const gut = 'calc(var(--bw) * 0.5)'
      const sw = 'calc(var(--bw) * ' + SPAN + ' / ' + N + ')'
      const A = 'calc(-1 * (' + gut + ' + ' + i + ' * ' + sw + '))'
      const B = 'calc((' + (i + 1) + ' * ' + sw + ') - ' + gut + ')'
      const front = div('sk-face front')
      const back = div('sk-face back')
      const dress = (face: HTMLDivElement, url: string, px: string) => {
        face.style.backgroundImage = 'url(' + url + ')'
        face.style.backgroundPositionX = px
      }
      const fromUrl = fromSp?.image || ''
      const toUrl = toSp?.image || ''
      const useFrom = turn.dir === 'next'
      dress(front, useFrom ? fromUrl : toUrl, useFrom ? A : B)
      dress(back, useFrom ? toUrl : fromUrl, useFrom ? B : A)
      front.appendChild(div('sk-sh'))
      front.appendChild(div('sk-gl'))
      back.appendChild(div('sk-sh'))
      back.appendChild(div('sk-gl'))
      s.appendChild(front)
      s.appendChild(back)
      if (i === N - 1) s.classList.add('edge')
      host.appendChild(s)
      host = s
      strips.push(s)
    }
    turn.strips = strips
    return c
  }

  const applyTurn = useCallback((t: number) => {
    const turn = turnRef.current
    const tilt = tiltRef.current
    if (!turn || !tilt) return
    const th = Math.PI * t
    const beta = BETA * Math.sin(Math.PI * t)
    const D = 180 / Math.PI
    const tt = th + beta
    const td = (2 * beta) / N
    tilt.style.setProperty('--tt', (tt * D).toFixed(2) + 'deg')
    tilt.style.setProperty('--td', (td * D).toFixed(3) + 'deg')
    tilt.style.setProperty('--shade', Math.sin(Math.PI * t).toFixed(3))
    // 逐条明暗
    for (let i = 0; i < turn.strips.length; i++) {
      const l1 = Math.abs(Math.cos(tt - i * td))
      const l2 = Math.abs(Math.cos(tt - (i + 1) * td))
      const st = turn.strips[i].style
      st.setProperty('--lit', l1.toFixed(3))
      st.setProperty('--a1', ((1 - l1) * 0.62).toFixed(3))
      st.setProperty('--a2', ((1 - l2) * 0.62).toFixed(3))
    }
  }, [])

  /* ---------- 放大镜 ---------- */
  const placeLoupe = useCallback(() => {
    const loupe = loupeRef.current
    const zoomWrap = zoomWrapRef.current
    const zoomInner = zoomInnerRef.current
    const ls = loupeRefState.current
    const B = bookBox()
    if (!loupe || !zoomWrap || !zoomInner || !B.w || ls.x === null) return
    const R = loupeSize() / 2
    const bez = R * 2 * 0.058
    loupe.style.setProperty('--lr', R * 2 + 'px')
    loupe.style.transform = 'translate3d(' + (ls.x - R).toFixed(1) + 'px,' + (ls.y - R).toFixed(1) + 'px,0)'
    if (loupeOn) loupe.classList.add('on')
    else loupe.classList.remove('on')

    const z = viewRef.current.z
    const cx = B.w / 2
    const cy = B.h / 2
    const x0 = cx + (B.w * 0.051 - cx) * z
    const x1 = cx + (B.w * 0.949 - cx) * z
    const y0 = cy + (B.h * 0.218 - cy) * z
    const y1 = cy + (B.h * 0.782 - cy) * z
    const nx = Math.max(x0, Math.min(ls.x, x1))
    const ny = Math.max(y0, Math.min(ls.y, y1))
    const inside = ls.x > x0 && ls.x < x1 && ls.y > y0 && ls.y < y1
      ? Math.min(ls.x - x0, x1 - ls.x, ls.y - y0, y1 - ls.y)
      : -Math.hypot(ls.x - nx, ls.y - ny)
    const k = clamp((inside + R * 0.3) / (R * 0.55), 0, 1)
    zoomWrap.style.opacity = (loupeOn ? k : 0).toFixed(3)
    if (k <= 0.002) return
    const r = (R - bez).toFixed(1)
    const mask = 'radial-gradient(circle ' + r + 'px at ' + ls.x.toFixed(1) + 'px ' + ls.y.toFixed(1) + 'px, #000 calc(100% - 1px), transparent 100%)'
    zoomWrap.style.webkitMaskImage = mask
    zoomWrap.style.maskImage = mask
    const px = cx + (ls.x - cx) / z
    const py = cy + (ls.y - cy) / z
    const s = MAG * z
    zoomInner.style.transform = 'translate(' + (ls.x - px * s).toFixed(1) + 'px,' + (ls.y - py * s).toFixed(1) + 'px) scale(' + s.toFixed(4) + ')'
  }, [bookBox, loupeOn, loupeSize])

  const restLoupe = useCallback(() => {
    const B = bookBox()
    if (!B.w) return
    loupeRefState.current.x = B.w * 0.88
    loupeRefState.current.y = B.h * 0.855
    placeLoupe()
  }, [bookBox, placeLoupe])

  const shoveLoupe = useCallback((dir: Dir) => {
    const ls = loupeRefState.current
    const B = bookBox()
    if (!loupeOn || ls.x === null || ls.grab || !B.w) return
    const nx = (B.w / 2 + (ls.x - B.w / 2) / viewRef.current.z) / B.w
    const ny = (B.h / 2 + (ls.y - B.h / 2) / viewRef.current.z) / B.h
    if (nx < 0.02 || nx > 0.98 || ny < 0.17 || ny > 0.83) return
    ls.target = { x: B.w * (dir === 'next' ? 0.12 : 0.88), y: B.h * 0.855 }
  }, [bookBox, loupeOn])

  const syncZoomLayer = useCallback(() => {
    const zoomInner = zoomInnerRef.current
    const book = bookRef.current
    if (!zoomInner || !book) return
    zoomInner.textContent = ''
    for (const c of Array.from(book.children)) {
      zoomInner.appendChild(c.cloneNode(true))
    }
  }, [])

  /* ---------- 倾斜 / 缩放 ---------- */
  const applyView = useCallback(() => {
    const tilt = tiltRef.current
    const v = viewRef.current
    if (!tilt) return
    tilt.style.setProperty('--rx', v.rx.toFixed(2) + 'deg')
    tilt.style.setProperty('--ry', v.ry.toFixed(2) + 'deg')
    tilt.style.setProperty('--zoom', v.z.toFixed(3))
    if (v.z !== lastZ.current) {
      lastZ.current = v.z
      if (zoomReadRef.current) zoomReadRef.current.textContent = Math.round(v.z * 100) + '%'
      if (zInRef.current) zInRef.current.disabled = v.z >= ZOOM_MAX - 0.001
      if (zOutRef.current) zOutRef.current.disabled = v.z <= ZOOM_MIN + 0.001
      placeLoupe()
    }
  }, [placeLoupe])

  const setView = useCallback((rx: number, ry: number, z: number) => {
    const v = viewRef.current
    v.trx = clamp(rx, -TILT_X, TILT_X)
    v.try_ = clamp(ry, -TILT_Y, TILT_Y)
    v.tz = clamp(z, ZOOM_MIN, ZOOM_MAX)
    viewActive.current = true
    kick()
  }, [])

  const viewSpring = useCallback((): boolean => {
    const e = 0.14
    const v = viewRef.current
    let moved = false

    for (const [k, t] of [['rx', 'trx'], ['ry', 'try_'], ['z', 'tz']] as [keyof typeof v, keyof typeof v][]) {
      const target = v[t]
      const cur = v[k]
      if (Math.abs(target - cur) > 0.0006) {
        ;(v as any)[k] = cur + (target - cur) * e
        moved = true
      } else {
        ;(v as any)[k] = target
      }
    }
    if (moved) applyView()
    viewActive.current = moved
    return moved
  }, [applyView])

  const tiltTo = useCallback((cx: number, cy: number) => {
    if (dragRef.current) return
    const book = bookRef.current
    if (!book) return
    const r = book.getBoundingClientRect()
    if (!r.width) return
    const nx = clamp((cx - (r.left + r.width / 2)) / (r.width * 0.62), -1, 1)
    const ny = clamp((cy - (r.top + r.height / 2)) / (r.height * 0.9), -1, 1)
    setView(-ny * TILT_X, nx * TILT_Y, viewRef.current.z)
  }, [setView])

  /* ---------- 翻页 ---------- */
  const goTo = useCallback((i: number) => {
    const total = spreads.length
    if (i === idxRef.current || i < 0 || i >= total) return
    if (turnRef.current) idxRef.current = turnRef.current.to
    const fwd = (i - idxRef.current + total) % total
    const back = (idxRef.current - i + total) % total
    if (Math.min(fwd, back) === 1) {
      step(fwd === 1 ? 'next' : 'prev')
    } else {
      idxRef.current = i
      setIdx(i)
      turnRef.current = null
      paint()
    }
  }, [spreads.length, paint])

  const step = useCallback((dir: Dir) => {
    if (turnRef.current) {
      idxRef.current = turnRef.current.to
      turnRef.current = null
    }
    startTurn(dir, 0)
    commit()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startTurn = useCallback((dir: Dir, t: number) => {
    springRef.current = null
    if (turnRef.current) idxRef.current = turnRef.current.to
    const from = idxRef.current
    const total = spreads.length
    const to = dir === 'next' ? (from + 1) % total : (from - 1 + total) % total
    shoveLoupe(dir)
    turnRef.current = { dir, from, to, t: t || 0, strips: [] }
    paint()
  }, [paint, shoveLoupe, spreads.length])

  const commit = useCallback(() => {
    const turn = turnRef.current
    if (!turn) return
    if (reducedRef.current) {
      idxRef.current = turn.to
      setIdx(turn.to)
      turnRef.current = null
      paint()
      return
    }
    animateTo(1, () => {
      idxRef.current = turn.to
      setIdx(turn.to)
      turnRef.current = null
      paint()
    }, 170, 26)
  }, [paint])

  const cancel = useCallback(() => {
    if (!turnRef.current) return
    animateTo(0, () => {
      turnRef.current = null
      paint()
    }, 150, 24)
  }, [paint])

  const animateTo = useCallback((target: number, onDone: () => void, stiff: number, damp: number) => {
    springRef.current = { kind: 'spring', v: 0, target, done: onDone, k: stiff || 150, c: damp || 22 }
    kick()
  }, [])

  /* ---------- 弹簧/动画循环 ---------- */
  const viewActive = useRef(false)
  const kick = useCallback(() => {
    if (rafRef.current === null) {
      lastTs.current = performance.now()
      rafRef.current = requestAnimationFrame(tick)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loupeEase = useCallback((): boolean => {
    const ls = loupeRefState.current
    if (!ls.target) return false
    if (ls.grab) {
      ls.target = null
      return false
    }
    const dx = ls.target.x - ls.x
    const dy = ls.target.y - ls.y
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      ls.x = ls.target.x
      ls.y = ls.target.y
      ls.target = null
      placeLoupe()
      return false
    }
    ls.x += dx * 0.17
    ls.y += dy * 0.17
    placeLoupe()
    return true
  }, [placeLoupe])
  const tick = useCallback((now: number) => {
    rafRef.current = null
    const dt = Math.min(0.032, (now - lastTs.current) / 1000 || 0.016)
    lastTs.current = now

    const s = springRef.current
    if (s && turnRef.current) {
      if (s.kind === 'tween') {
        s.e += dt
        const k = Math.min(1, s.e / s.dur)
        turnRef.current.t = s.from + (s.target - s.from) * k
        applyTurn(turnRef.current.t)
        if (k >= 1) {
          springRef.current = null
          const d = s.done
          d && d()
        }
      } else {
        const x = turnRef.current.t - s.target
        s.v += (-s.k * x - s.c * s.v) * dt
        turnRef.current.t += s.v * dt
        if (Math.abs(turnRef.current.t - s.target) < 0.002 && Math.abs(s.v) < 0.02) {
          turnRef.current.t = s.target
          springRef.current = null
          applyTurn(turnRef.current.t)
          const d = s.done
          d && d()
        } else {
          applyTurn(turnRef.current.t)
        }
      }
    }

    viewSpring()
    const lmoved = loupeEase()
    if ((springRef.current || viewActive.current || lmoved) && rafRef.current === null) {
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [applyTurn, loupeEase, viewSpring])


  /* ---------- 布局 ---------- */
  const layout = useCallback(() => {
    const book = bookRef.current
    if (!book) return
    book.style.setProperty('--bw', book.clientWidth + 'px')
    loupeRefState.current.x = null
    restLoupe()
  }, [restLoupe])

  useEffect(() => {
    layout()
    const onResize = () => layout()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [layout])

  useEffect(() => {
    paint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paint])

  /* ---------- 指针交互（翻页 + 倾斜 + 放大镜拖拽） ---------- */
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('.sk-loupe, .sk-tools, button, .sk-index, a')) return
    e.preventDefault()
    const stage = e.currentTarget as HTMLElement
    stage.setPointerCapture(e.pointerId)
    setShowHint(false)
    const book = bookRef.current
    if (book && !loupeRefState.current.grab) {
      const r = book.getBoundingClientRect()
      const dir: Dir = (e.clientX - r.left) / r.width > 0.5 ? 'next' : 'prev'
      startTurn(dir, 0)
      dragRef.current = { dir, x0: e.clientX, w: r.width, moved: 0, vel: 0, tPrev: performance.now() }
    }
  }, [startTurn])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    tiltTo(e.clientX, e.clientY)
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.x0
    d.moved = Math.max(d.moved, Math.abs(dx))
    const raw = (d.dir === 'next' ? -dx : dx) / (d.w * 0.62)
    const t = clamp(raw, 0, 1)
    const now = performance.now()
    d.vel = (t - (turnRef.current?.t ?? 0)) / Math.max(0.001, (now - d.tPrev) / 1000)
    d.tPrev = now
    if (turnRef.current) {
      turnRef.current.t = t
      applyTurn(t)
    }
  }, [applyTurn, tiltTo])

  const onPointerUp = useCallback(() => {
    const d = dragRef.current
    dragRef.current = null
    if (!d || !turnRef.current) return
    if (d.moved < 6) {
      commit()
      return
    }
    const go = turnRef.current.t > 0.42 || d.vel > 1.1
    if (go) commit()
    else cancel()
  }, [commit, cancel])

  /* ---------- 键盘 ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowRight') { e.preventDefault(); step('next') }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step('prev') }
      else if (e.key === 'Escape') { setIndexOpen(false); onBack() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack, step])

  /* ---------- 放大镜拖拽 ---------- */
  const onLoupeDown = useCallback((e: React.PointerEvent) => {
    if (!loupeOn || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const ls = loupeRefState.current
    ls.grab = { cx: e.clientX, cy: e.clientY, x0: ls.x, y0: ls.y }
    ls.target = null
    loupeRef.current?.classList.add('held')
    loupeRef.current?.setPointerCapture(e.pointerId)
    setShowHint(false)
  }, [loupeOn])

  const onLoupeMove = useCallback((e: React.PointerEvent) => {
    const ls = loupeRefState.current
    if (!ls.grab) return
    const B = bookBox()
    const R = loupeSize() / 2
    ls.x = clamp(ls.grab.x0 + (e.clientX - ls.grab.cx), -R * 0.7, B.w + R * 0.7)
    ls.y = clamp(ls.grab.y0 + (e.clientY - ls.grab.cy), -R * 0.7, B.h + R * 1.0)
    placeLoupe()
  }, [bookBox, loupeSize, placeLoupe])

  const onLoupeUp = useCallback(() => {
    loupeRefState.current.grab = null
    loupeRef.current?.classList.remove('held')
  }, [])

  /* ---------- 工具条动作 ---------- */
  const onZoomIn = useCallback(() => setView(viewRef.current.trx, viewRef.current.try_, viewRef.current.tz * 1.16), [setView])
  const onZoomOut = useCallback(() => setView(viewRef.current.trx, viewRef.current.try_, viewRef.current.tz / 1.16), [setView])
  const onResetZoom = useCallback(() => setView(viewRef.current.trx, viewRef.current.try_, 1), [setView])

  const current = spreads[idx]

  return (
    <div ref={rootRef} className="sk-scope">
      {/* 植物水彩背景装饰 */}
      <Botany side="l" />
      <Botany side="r" />

      {/* 顶栏 */}
      <header className="sk-header">
        <button type="button" onClick={onBack} className="sk-back">
          <ArrowLeft className="h-3.5 w-3.5" />
          我的旅行画册
        </button>
        <div className="sk-title">{book.title}</div>
        <button type="button" onClick={onBack} aria-label="关闭" className="sk-close">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="sk-body">
        {/* 舞台 */}
        <div
          className="sk-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onResetZoom}
        >
          <button type="button" className="sk-arrow left" onClick={() => step('prev')} aria-label="上一图版">
            <ChevronLeft />
          </button>

          <div className="sk-3d" ref={threeDRef}>
            <div className="sk-tilt" ref={tiltRef}>
              <div className="sk-cast ambient" />
              <div className="sk-cast contact" />
              <div className="sk-cast hair" />
              <div className="sk-book" ref={bookRef} />
            </div>
            {/* 放大镜（在不倾斜的坐标系里） */}
            <div ref={zoomWrapRef} className="sk-zoomwrap">
              <div ref={zoomInnerRef} className="sk-zoominner" />
            </div>
            <div
              ref={loupeRef}
              className={'sk-loupe' + (loupeOn ? ' on' : '')}
              onPointerDown={onLoupeDown}
              onPointerMove={onLoupeMove}
              onPointerUp={onLoupeUp}
              onPointerCancel={onLoupeUp}
            >
              <div className="sk-ring">
                <div className="sk-lens" />
              </div>
              <div className="sk-grip" />
            </div>
          </div>

          <button type="button" className="sk-arrow right" onClick={() => step('next')} aria-label="下一图版">
            <ChevronRight />
          </button>
        </div>

        {/* 图注 */}
        <div className="sk-captionbar">
          <div className="sk-captionbox" key={idx}>
            <p className="sk-caption">
              {current?.title}
              {current?.place ? <span className="sk-meta"> · {current.place}</span> : null}
            </p>
          </div>
          <p className={'sk-hint' + (showHint ? '' : ' gone')}>拖动页面翻页 · 拖动放大镜查看细节</p>
        </div>
      </div>

      {/* 底部工具条 */}
      <div className="sk-toolbar">
        <div className="sk-tools">
          <button type="button" onClick={onZoomOut} ref={zOutRef} className="sk-tool" aria-label="缩小">
            <Minus />
          </button>
          <span className="sk-zoom-read" ref={zoomReadRef}>100%</span>
          <button type="button" onClick={onZoomIn} ref={zInRef} className="sk-tool" aria-label="放大">
            <Plus />
          </button>
          <span className="sk-tool-sep" />
          <button
            type="button"
            onClick={() => setLoupeOn((v) => { const nv = !v; if (nv) restLoupe(); return nv })}
            className="sk-tool"
            data-loupe
            aria-pressed={loupeOn}
            aria-label="放大镜"
          >
            <Search />
          </button>
          <button
            type="button"
            onClick={() => setSketch((v) => !v)}
            className="sk-tool"
            aria-pressed={sketch}
            aria-label="素描滤镜"
            title="素描滤镜（前端近似，不调用通义）"
          >
            <Paintbrush />
          </button>
          <span className="sk-tool-sep" />
          <button type="button" onClick={() => setIndexOpen((v) => !v)} className="sk-tool" aria-pressed={indexOpen} aria-label="图版目录">
            <List />
          </button>
          {onToggleBook && (
            <>
              <span className="sk-tool-sep" />
              <button type="button" onClick={onToggleBook} className="sk-tool" aria-label="切换为经典书页" title="切换为经典书页">
                <BookOpen className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 图版索引 */}
      <div className={'sk-index' + (indexOpen ? ' open' : '')}>
        <h3>图版目录</h3>
        <p className="sk-index-sub">{book.title} · {spreads.length} 个图版</p>
        <ol className="plate-list">
          {spreads.map((sp) => (
            <li key={sp.index}>
              <button
                type="button"
                className="sk-plate"
                aria-current={sp.index === idx ? 'true' : 'false'}
                onClick={() => { goTo(sp.index); setIndexOpen(false) }}
              >
                <span className="n">{String(sp.index + 1).padStart(2, '0')}</span>
                <span className="t">{sp.kind === 'summary' ? '旅行总结' : sp.title}</span>
                <span className="p">{sp.kind === 'summary' ? 'End' : sp.place || sp.date}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function Botany({ side }: { side: 'l' | 'r' }) {
  return (
    <svg className={'sk-botany ' + side} viewBox="0 0 200 240" fill="none" aria-hidden="true">
      {side === 'l' ? (
        <g stroke="#7c8a5a" strokeWidth="2" strokeLinecap="round">
          <path d="M0 240 C40 190 60 150 62 108 C64 66 48 30 30 10" />
          <path d="M30 10 C20 60 24 120 60 170" />
          <path d="M40 60 C70 50 96 56 104 84 C78 92 50 88 40 60Z" fill="#a8b57e" fillOpacity="0.35" stroke="none" />
          <path d="M52 120 C84 108 112 116 118 144 C90 152 60 146 52 120Z" fill="#b6c08c" fillOpacity="0.3" stroke="none" />
          <path d="M56 176 C90 166 116 174 122 200 C92 208 64 200 56 176Z" fill="#c3c79b" fillOpacity="0.28" stroke="none" />
        </g>
      ) : (
        <g stroke="#7c8a5a" strokeWidth="2" strokeLinecap="round">
          <path d="M200 240 C160 190 140 150 138 108 C136 66 152 30 170 10" />
          <path d="M170 10 C180 60 176 120 140 170" />
          <path d="M160 60 C130 50 104 56 96 84 C122 92 150 88 160 60Z" fill="#a8b57e" fillOpacity="0.35" stroke="none" />
          <path d="M148 120 C116 108 88 116 82 144 C110 152 140 146 148 120Z" fill="#b6c08c" fillOpacity="0.3" stroke="none" />
          <path d="M144 176 C110 166 84 174 78 200 C108 208 136 200 144 176Z" fill="#c3c79b" fillOpacity="0.28" stroke="none" />
        </g>
      )}
    </svg>
  )
}
