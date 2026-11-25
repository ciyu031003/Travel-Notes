'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Book, BookChapter, BookPhoto } from '@/components/album/travel-book/TravelBook'
import { TRAVEL_TYPE_LABELS, formatDotDate } from '@/lib/modules/album/presentation'
import {
  IconCalendar,
  IconCamera,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconExpand,
  IconLayers,
  IconPin,
} from './Icons'

/**
 * 沉浸式相册舞台（桌面专属 · 展开态）
 * ============================================================================
 * 从画册墙点开一本画册后：把全书拆成「一幕一幕」的卡片，用真正 3D 的牌堆呈现。
 *
 *  · 牌堆（stack）：当前卡在前，左右两侧各压一张（±7° rotateY + 缩放），其余藏到后方；
 *    切换时整摞牌用 transform 过渡「推」过去，不是淡入淡出；
 *  · 拖牌：按住当前卡左右拖动，卡面跟随指针 rotateY，松手超过阈值就翻到上一张/下一张；
 *  · 扇形（fan）：把整摞牌摊成一把扇子（每张独立角度/位移），点哪张就回牌堆并定位；
 *  · 键盘：← / → 切换、Esc 关闭、Home / End 首尾；
 *  · 有照片的书 → 一幕一张大图；没有照片的书（当前种子数据就是）→ 章节卡退化成
 *    「象牙纸面 + 大号衬线数字」的排版卡，仍然是一本完整的画册，而不是空白页。
 * 颜色/阴影/动效全部在 web-album.css。
 */

const DRAG_THRESHOLD = 64
const FAN_LIMIT = 12

export interface SlideCover {
  kind: 'cover'
  key: string
  image: string | null
  title: string
  kicker: string
  meta: string[]
  description: string | null
}

export interface SlidePhoto {
  kind: 'photo'
  key: string
  image: string | null
  title: string
  kicker: string
  caption: string | null
}

export interface SlideChapter {
  kind: 'chapter'
  key: string
  numeral: string
  date: string
  title: string
  text: string | null
  spots: number
  photos: number
  kicker: string
}

export type Slide = SlideCover | SlidePhoto | SlideChapter

type StageStyle = CSSProperties & Record<string, string | number>

function dayRange(start: string | null, end: string | null): string {
  const a = formatDotDate(start)
  if (!a) return '时间待记录'
  const b = formatDotDate(end)
  if (!b) return a
  if (a.slice(0, 4) === b.slice(0, 4)) return a + ' – ' + b.slice(5)
  return a + ' – ' + b
}

function chapterText(chapter: BookChapter): string | null {
  if (chapter.summary) return chapter.summary
  const joined = chapter.memories
    .map((m) => m.content || m.title)
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(' ')
  return joined || null
}

function photoAltSource(chapter: BookChapter, photo: BookPhoto): string | null {
  const own = chapter.memories.find((m) => m.photos.some((p) => p.id === photo.id))
  return own?.content || own?.title || chapter.summary || null
}

/** 把一本画册拆成「幕」：封面 → 照片（优先）/ 章节排版卡（无照片时） */
export function buildSlides(book: Book, summaryTitle?: string): Slide[] {
  const title = book.title || summaryTitle || '旅行画册'
  const cover = book.coverPreview || book.coverThumb || null
  const meta: string[] = [dayRange(book.startDate, book.endDate)]
  if (book.dayCount) meta.push(book.dayCount + ' 天')
  meta.push(book.photoCount + ' 张照片')
  if (book.location) meta.push(book.location)

  const coverSlide: SlideCover = {
    kind: 'cover',
    key: 'cover',
    image: cover,
    title,
    kicker: 'TRAVEL BOOK' + (book.travelType ? ' · ' + (TRAVEL_TYPE_LABELS[book.travelType] || '') : ''),
    meta,
    description: book.description,
  }

  const photoSlides: SlidePhoto[] = []
  for (const chapter of book.chapters) {
    for (const photo of chapter.photos) {
      photoSlides.push({
        kind: 'photo',
        key: 'p' + chapter.id + '-' + photo.id,
        image: photo.previewUrl || photo.fullUrl || photo.thumbnailUrl,
        title: chapter.title || '第 ' + chapter.index + ' 天',
        kicker: 'DAY ' + String(chapter.index).padStart(2, '0') + (chapter.date ? ' · ' + formatDotDate(chapter.date) : ''),
        caption: photoAltSource(chapter, photo) || chapter.summary,
      })
    }
  }

  if (photoSlides.length > 0) return [coverSlide, ...photoSlides]

  const chapterSlides: SlideChapter[] = book.chapters.map((chapter) => ({
    kind: 'chapter',
    key: 'c' + chapter.id,
    numeral: String(chapter.index).padStart(2, '0'),
    date: formatDotDate(chapter.date) || '时间待记录',
    title: chapter.title || '第 ' + chapter.index + ' 天',
    text: chapterText(chapter),
    spots: chapter.itinerary.length,
    photos: chapter.photos.length,
    kicker: 'DAY ' + String(chapter.index).padStart(2, '0'),
  }))

  return [coverSlide, ...chapterSlides]
}

/** 卡面图片：解码完成才淡入（换源时重置），避免大图切幕闪白 */
function StageArt({ src, plain }: { src: string | null; plain?: boolean }) {
  // 解码完成才淡入。用「src + loaded」成对存状态而不是 useEffect 复位：
  // 图片可能命中缓存、在 passive effect 之前就 fire load —— 复位会把它打回不可见。
  const [decoded, setDecoded] = useState<{ src: string | null; loaded: boolean }>({ src: null, loaded: false })
  const loaded = Boolean(src) && decoded.src === src && decoded.loaded
  if (!src) return <span className={'wa-slide-art' + (plain ? ' wa-slide-art--plain' : '')} aria-hidden="true" />
  return (
    <span className="wa-slide-art" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- 远端 CDN 原图，next/image 优化器在本机返回 504 */}
      <img
        key={src}
        src={src}
        alt=""
        data-loaded={loaded ? 'true' : 'false'}
        decoding="async"
        draggable={false}
        onLoad={() => setDecoded({ src, loaded: true })}
      />
    </span>
  )
}

function SlideView({ slide }: { slide: Slide }) {
  if (slide.kind === 'chapter') {
    return (
      <span className="wa-slide wa-slide--paper">
        <span className="wa-slide-paper">
          <span className="wa-slide-paper-top">
            <span className="wa-slide-numeral">{slide.numeral}</span>
            <span className="wa-slide-paper-date">{slide.date}</span>
          </span>
          <span>
            <span className="wa-slide-paper-title">{slide.title}</span>
            {slide.text ? <span className="wa-slide-paper-text">{slide.text}</span> : null}
          </span>
          <span className="wa-slide-paper-foot">
            <span>
              <IconPin size={14} />
              {slide.spots} 处行程
            </span>
            <span>
              <IconCamera size={14} />
              {slide.photos} 张照片
            </span>
            <span>
              <IconCalendar size={14} />
              {slide.kicker}
            </span>
          </span>
        </span>
      </span>
    )
  }

  return (
    <span className={'wa-slide' + (slide.kind === 'cover' ? ' wa-slide--cover' : '')}>
      <StageArt src={slide.image} plain={!slide.image} />
      <span className="wa-slide-body">
        <span className="wa-slide-kicker">{slide.kicker}</span>
        {slide.kind === 'cover' ? (
          <>
            <span className="wa-cover-title">{slide.title}</span>
            <span className="wa-cover-meta">
              {slide.meta.map((item, i) => (
                <span key={item + i}>
                  {i > 0 ? <i aria-hidden="true" /> : null}
                  {item}
                </span>
              ))}
            </span>
            {slide.description ? <span className="wa-cover-desc">{slide.description}</span> : null}
          </>
        ) : (
          <>
            <span className="wa-slide-title">{slide.title}</span>
            {slide.caption ? <span className="wa-slide-caption">{slide.caption}</span> : null}
          </>
        )}
      </span>
    </span>
  )
}

export default function WebAlbumStage({
  book,
  fallbackTitle,
  loading,
  error,
  onClose,
  onRetry,
}: {
  book: Book | null
  /** 详情还没到时先用摘要标题撑住头部 */
  fallbackTitle: string
  loading: boolean
  error: string
  onClose: () => void
  onRetry: () => void
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const deckRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ id: number; startX: number; captured: boolean } | null>(null)
  const [entered, setEntered] = useState(false)
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState<'stack' | 'fan'>('stack')
  const [dragDx, setDragDx] = useState(0)
  const [dragging, setDragging] = useState(false)

  const slides = useMemo(() => (book ? buildSlides(book, fallbackTitle) : []), [book, fallbackTitle])
  const count = slides.length
  const current = count > 0 ? slides[Math.min(index, count - 1)] : null
  const title = book?.title || fallbackTitle

  /** 入场动画（一帧后加 data-open 触发 opacity 过渡） */
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  /** 打开时锁页面滚动 + 聚焦舞台；关闭后把焦点还给触发元素 */
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    rootRef.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = prevOverflow
      previous?.focus?.({ preventScroll: true })
    }
  }, [])

  /** 换书（含详情刚到）时回到第一幕 */
  useEffect(() => {
    setIndex(0)
    setMode('stack')
  }, [book?.bookKey])

  useEffect(() => {
    if (index > count - 1) setIndex(Math.max(0, count - 1))
  }, [count, index])

  const go = useCallback(
    (dir: -1 | 1) => {
      if (count < 2) return
      setIndex((prev) => (prev + dir + count) % count)
    },
    [count],
  )

  /** 键盘：← → 切换 / Esc 关闭 / Home End 首尾 / f 扇形 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setMode('stack')
        go(-1)
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setMode('stack')
        go(1)
        return
      }
      if (e.key === 'Home') {
        e.preventDefault()
        setIndex(0)
        return
      }
      if (e.key === 'End') {
        e.preventDefault()
        setIndex(Math.max(0, count - 1))
        return
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        setMode((m) => (m === 'fan' ? 'stack' : 'fan'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count, go, onClose])

  /** 拖牌翻页：按住当前卡左右拖动，松手按位移距离决定是否翻页 */
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (mode !== 'stack' || count < 2) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const g = { id: e.pointerId, startX: e.clientX, captured: false }
    dragRef.current = g
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      g.captured = true
    } catch {
      // 老浏览器没有指针捕获：仍可在卡片内拖动
    }
    setDragging(true)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = dragRef.current
    if (!g || g.id !== e.pointerId) return
    setDragDx(e.clientX - g.startX)
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = dragRef.current
    if (!g || g.id !== e.pointerId) return
    dragRef.current = null
    if (g.captured) {
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        // 忽略
      }
    }
    const dx = e.clientX - g.startX
    setDragging(false)
    setDragDx(0)
    if (Math.abs(dx) >= DRAG_THRESHOLD) go(dx < 0 ? 1 : -1)
  }

  const cancelDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = dragRef.current
    if (!g || g.id !== e.pointerId) return
    dragRef.current = null
    setDragging(false)
    setDragDx(0)
  }

  const deckStyle: StageStyle =
    mode === 'fan'
      ? { ['--wa-fan-step' as string]: count > 9 ? '98px' : count > 7 ? '114px' : '132px' }
      : {}

  const ambient = book?.coverPreview || book?.coverThumb || null

  return (
    <div
      ref={rootRef}
      className="wa-stage"
      data-open={entered ? 'true' : 'false'}
      role="dialog"
      aria-modal="true"
      aria-label={'《' + title + '》沉浸式相册'}
      tabIndex={-1}
    >
      <div className="wa-stage-bg" aria-hidden="true">
        {ambient ? (
          // eslint-disable-next-line @next/next/no-img-element -- 环境光背景，远端封面
          <img src={ambient} alt="" draggable={false} />
        ) : null}
      </div>

      <header className="wa-stage-bar">
        <div className="wa-stage-side wa-stage-side--left">
          <button type="button" className="wa-stage-btn" onClick={onClose}>
            <IconChevronLeft size={17} />
            返回画册墙
          </button>
        </div>

        <div className="wa-stage-heading">
          <span className="wa-stage-eyebrow">
            {book
              ? [book.location, TRAVEL_TYPE_LABELS[book.travelType || ''] || '', dayRange(book.startDate, book.endDate)]
                  .filter(Boolean)
                  .join(' · ')
              : '旅行画册'}
          </span>
          <span className="wa-stage-name">{title}</span>
        </div>

        <div className="wa-stage-side wa-stage-side--right">
          <span className="wa-counter" aria-live="polite">
            <b>{String(Math.min(index + 1, Math.max(count, 1))).padStart(2, '0')}</b>
            <i>/</i>
            {String(Math.max(count, 1)).padStart(2, '0')}
          </span>
          <button type="button" className="wa-stage-btn wa-stage-btn--icon" onClick={onClose} aria-label="关闭相册">
            <IconClose size={17} />
          </button>
        </div>
      </header>

      <div className="wa-stage-body">
        {loading ? (
          <div className="wa-stage-loading">
            <span className="wa-spinner" aria-hidden="true" />
            正在翻开《{fallbackTitle}》…
          </div>
        ) : error ? (
          <div className="wa-stage-empty" role="alert">
            <p>{error}</p>
            <button type="button" className="wa-stage-btn" onClick={onRetry}>
              重新加载
            </button>
          </div>
        ) : count === 0 ? (
          <div className="wa-stage-empty">
            <p>这本画册还没有内容。等旅程写满，再回来翻开它。</p>
          </div>
        ) : (
          <div
            ref={deckRef}
            className="wa-deck"
            data-mode={mode}
            data-drag={dragging ? 'true' : 'false'}
            style={deckStyle}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
          >
            {slides.map((slide, i) => {
              let rel: string = 'other'
              if (mode === 'stack') {
                let distance = i - index
                if (count > 2) {
                  if (distance > count / 2) distance -= count
                  if (distance < -count / 2) distance += count
                }
                rel = distance === 0 ? '0' : distance === 1 ? '1' : distance === -1 ? '-1' : 'other'
              }
              const fanIndex = i - (Math.min(count, FAN_LIMIT) - 1) / 2
              const cardStyle: StageStyle =
                mode === 'fan'
                  ? {
                      ['--wa-fan-i' as string]: String(fanIndex),
                      ['--wa-fan-abs' as string]: String(Math.abs(fanIndex)),
                    }
                  : rel === '0' && dragDx !== 0
                    ? {
                        transform:
                          'translate3d(' +
                          (dragDx * 0.18).toFixed(1) +
                          'px,0,0) rotateY(' +
                          (-dragDx * 0.03).toFixed(2) +
                          'deg)',
                      }
                    : {}

              return (
                <article
                  key={slide.key}
                  className="wa-deck-card"
                  data-rel={rel}
                  data-active={i === index ? 'true' : 'false'}
                  data-dragging={dragging && rel === '0' ? 'true' : 'false'}
                  style={cardStyle}
                  aria-hidden={mode === 'stack' && rel === 'other' ? true : undefined}
                  onClick={
                    mode === 'fan'
                      ? () => {
                          setIndex(i)
                          setMode('stack')
                        }
                      : undefined
                  }
                >
                  <SlideView slide={slide} />
                </article>
              )
            })}
          </div>
        )}
      </div>

      <footer className="wa-stage-foot">
        <div className="wa-stage-side wa-stage-side--left">
          <button
            type="button"
            className="wa-stage-btn wa-stage-btn--icon"
            onClick={() => go(-1)}
            aria-label="上一张"
            disabled={count < 2}
          >
            <IconChevronLeft size={18} />
          </button>
          <button
            type="button"
            className="wa-stage-btn wa-stage-btn--icon"
            onClick={() => go(1)}
            aria-label="下一张"
            disabled={count < 2}
          >
            <IconChevronRight size={18} />
          </button>
        </div>

        <div className="wa-rail-wrap">
          <div className="wa-rail" role="tablist" aria-label="画册目录">
            {(count > FAN_LIMIT && mode === 'fan' ? slides.slice(0, FAN_LIMIT) : slides).map((slide, i) => {
              const thumb = slide.kind === 'chapter' ? null : slide.image
              return (
                <button
                  key={slide.key}
                  type="button"
                  className="wa-thumb"
                  data-active={i === index ? 'true' : 'false'}
                  role="tab"
                  aria-selected={i === index}
                  aria-label={'跳到第 ' + (i + 1) + ' 张'}
                  onClick={() => {
                    setIndex(i)
                    setMode('stack')
                  }}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 缩略图轨道，远端图
                    <img src={thumb} alt="" loading="lazy" decoding="async" draggable={false} />
                  ) : (
                    <span className="wa-thumb-paper">{slide.kind === 'chapter' ? slide.numeral : '01'}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="wa-stage-side wa-stage-side--right">
          <button
            type="button"
            className="wa-stage-btn"
            data-pressed={mode === 'fan' ? 'true' : 'false'}
            aria-pressed={mode === 'fan'}
            onClick={() => setMode((m) => (m === 'fan' ? 'stack' : 'fan'))}
          >
            {mode === 'fan' ? <IconLayers size={16} /> : <IconExpand size={16} />}
            {mode === 'fan' ? '回到牌堆' : '扇形展开'}
          </button>
          <span className="wa-stage-keyhint">
            <kbd>←</kbd>
            <kbd>→</kbd>
            切换 · <kbd>Esc</kbd> 关闭
          </span>
        </div>
      </footer>

      <span className="wa-sr-only" aria-live="polite">
        {current ? '第 ' + (index + 1) + ' 幕，共 ' + count + ' 幕' : ''}
      </span>
    </div>
  )
}