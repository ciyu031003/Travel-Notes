'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { BookSummary } from '@/components/album/travel-book/TravelBook'
import { TRAVEL_TYPE_LABELS } from '@/lib/modules/album/presentation'
import { IconArrowRight } from './Icons'

/**
 * 画册墙 · 单张「画册卡」（桌面专属）
 * ============================================================================
 * 交互（参考 designeer 互动卡片 + 移动端 TiltCoverCard，但桌面幅度更克制）：
 *  · 指针悬停 → 卡片随指针做 rotateX / rotateY（≤ 7°）+ 抬升 + 阴影加深；
 *  · 按住拖动 → 倾角放大到 10°（上限由需求锁死）并轻微放大，像把封面捏起来；
 *  · 卡面叠两层光：跟随指针的柔和高光（--wa-mx/--wa-my）+ hover 时一次的微光扫过；
 *  · 进出视口 → 一次性渐入（IntersectionObserver，看过后不再重复）；
 *  · 封面只在卡片进入视口后才赋 src（懒加载），解码完成再淡入，避免首屏白块。
 * 颜色/渐变/阴影全部在 web-album.css，组件只写 CSS 变量与类名。
 */

/** 悬停时的最大倾角（需求：≤10°） */
const HOVER_TILT = 7
/** 按住拖动时的最大倾角（需求：≤10°） */
const PRESS_TILT = 10

type CardStyle = CSSProperties & Record<'--wa-delay', string>

function dateRange(start: string | null, end: string | null): string {
  if (!start) return '待记录'
  const a = start.slice(0, 10).replace(/-/g, '.')
  if (!end) return a
  const b = end.slice(0, 10).replace(/-/g, '.')
  if (a.slice(0, 4) === b.slice(0, 4)) return a + ' – ' + b.slice(5)
  return a + ' – ' + b
}

export default function AlbumCard({
  book,
  index,
  onOpen,
  onIntent,
}: {
  book: BookSummary
  index: number
  /** 点击卡片：翻开沉浸式相册 */
  onOpen: (book: BookSummary) => void
  /** 悬停 / 按下：预取单本详情（只拉数据，不改变任何视觉） */
  onIntent: (book: BookSummary) => void
}) {
  const cardRef = useRef<HTMLButtonElement | null>(null)
  const rafRef = useRef(0)
  const pendingRef = useRef<{ x: number; y: number; tilt: number } | null>(null)
  const pressedRef = useRef(false)
  const [revealed, setRevealed] = useState(false)
  const [artVisible, setArtVisible] = useState(false)
  const [artLoaded, setArtLoaded] = useState(false)

  const cover = book.coverThumb || book.coverPreview || null
  const title = book.title || '未命名画册'
  const initial = (title || '行').trim().charAt(0)
  const tag = book.travelType ? TRAVEL_TYPE_LABELS[book.travelType] || '旅行' : '旅行'
  const location = book.location || ''

  /** 一次性渐入 + 封面懒加载：进入视口才赋 src */
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    if (typeof IntersectionObserver !== 'function') {
      setRevealed(true)
      setArtVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          setRevealed(true)
          setArtVisible(true)
          io.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  /** 把倾角/光斑写进 CSS 变量（一次 rAF 只写一帧） */
  const paint = useCallback(() => {
    rafRef.current = 0
    const el = cardRef.current
    const p = pendingRef.current
    if (!el || !p) return
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const nx = Math.min(1, Math.max(0, (p.x - rect.left) / rect.width))
    const ny = Math.min(1, Math.max(0, (p.y - rect.top) / rect.height))
    el.style.setProperty('--wa-rx', ((ny * 2 - 1) * p.tilt).toFixed(2) + 'deg')
    el.style.setProperty('--wa-ry', (-(nx * 2 - 1) * p.tilt).toFixed(2) + 'deg')
    el.style.setProperty('--wa-mx', (nx * 100).toFixed(1) + '%')
    el.style.setProperty('--wa-my', (ny * 100).toFixed(1) + '%')
  }, [])

  const aim = useCallback(
    (x: number, y: number, tilt: number) => {
      pendingRef.current = { x, y, tilt }
      const el = cardRef.current
      if (el) el.dataset.tilting = 'true'
      if (!rafRef.current) rafRef.current = requestAnimationFrame(paint)
    },
    [paint],
  )

  const rest = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    pendingRef.current = null
    pressedRef.current = false
    const el = cardRef.current
    if (!el) return
    el.dataset.tilting = 'false'
    for (const key of ['--wa-rx', '--wa-ry', '--wa-mx', '--wa-my']) el.style.removeProperty(key)
  }, [])

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  const handlePointerEnter = (e: ReactPointerEvent<HTMLButtonElement>) => {
    onIntent(book)
    if (e.pointerType !== 'mouse') return
    aim(e.clientX, e.clientY, HOVER_TILT)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== 'mouse' && !pressedRef.current) return
    aim(e.clientX, e.clientY, pressedRef.current ? PRESS_TILT : HOVER_TILT)
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pressedRef.current = true
    onIntent(book)
    aim(e.clientX, e.clientY, PRESS_TILT)
  }

  const handlePointerUp = () => {
    pressedRef.current = false
  }

  return (
    <button
      ref={cardRef}
      type="button"
      className="wa-card"
      data-revealed={revealed ? 'true' : 'false'}
      data-tilting="false"
      style={{ '--wa-delay': String(Math.min(index, 8) * 70) + 'ms' } as CardStyle}
      aria-label={'翻开《' + title + '》画册'}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={rest}
      onFocus={() => onIntent(book)}
      onClick={() => onOpen(book)}
      onDragStart={(e) => e.preventDefault()}
    >
      <span className="wa-card-frame">
        <span className="wa-card-media">
          {cover && artVisible ? (
            // eslint-disable-next-line @next/next/no-img-element -- 封面为远端 CDN 原图，next/image 优化器在本机 dev 对远端图返回 504；这里用显式懒加载 + 淡入
            <img
              src={cover}
              alt=""
              data-loaded={artLoaded ? 'true' : 'false'}
              loading="lazy"
              decoding="async"
              draggable={false}
              onLoad={() => setArtLoaded(true)}
            />
          ) : null}
          {!cover ? <span className="wa-card-fallback">{initial}</span> : null}
        </span>

        <span className="wa-card-top">
          <span className="wa-card-index">{String(index + 1).padStart(2, '0')}</span>
          <span className="wa-card-tag">{tag}</span>
        </span>

        <span className="wa-card-info">
          <span className="wa-card-date">{dateRange(book.startDate, book.endDate)}</span>
          <span className="wa-card-title">{title}</span>
          <span className="wa-card-meta">
            <span>{book.dayCount} 天</span>
            <i aria-hidden="true" />
            <span>{book.photoCount} 张照片</span>
            {location ? <i aria-hidden="true" /> : null}
            {location ? <span>{location}</span> : null}
          </span>
          <span className="wa-card-open">
            翻开画册
            <IconArrowRight size={15} />
          </span>
        </span>
      </span>

      <span className="wa-card-sheen" aria-hidden="true" />
      <span className="wa-card-sweep" aria-hidden="true" />
    </button>
  )
}
