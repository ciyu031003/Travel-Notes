'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, MapPin, X, Camera } from 'lucide-react'
import type { Book, BookChapter, BookPhoto } from './TravelBook'

type Page =
  | { kind: 'cover' }
  | { kind: 'chapter'; chapter: BookChapter }
  | { kind: 'photo'; chapter: BookChapter; photo: BookPhoto }
  | { kind: 'summary' }

const MOOD_LABEL: Record<string, string> = {
  开心: '开心', 幸福: '幸福', 想念: '想念', 期待: '期待', 平静: '平静', 累: '累了',
}

function formatDay(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return dateStr
  }
}

/** 把一本画册展开为「页」序列：封面 → 每章(章节标题页 + 每张照片一页) → 旅行总结 */
function buildPages(book: Book): Page[] {
  const pages: Page[] = [{ kind: 'cover' }]
  for (const chapter of book.chapters) {
    if (chapter.photos.length === 0) continue
    pages.push({ kind: 'chapter', chapter })
    for (const photo of chapter.photos) {
      pages.push({ kind: 'photo', chapter, photo })
    }
  }
  pages.push({ kind: 'summary' })
  return pages
}

function ChapterIntro({ chapter }: { chapter: BookChapter }) {
  return (
    <div className="flex h-full flex-col justify-center px-4">
      <div className="font-display text-[10px] font-semibold uppercase tracking-[0.4em] text-travel-bloom">
        Chapter {String(chapter.index).padStart(2, '0')}
      </div>
      <div className="mt-4 font-display text-2xl font-bold text-travel-ink sm:text-3xl">
        {chapter.title || `DAY ${String(chapter.index).padStart(2, '0')}`}
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm text-travel-ink/60">
        <MapPin className="h-4 w-4 text-travel-bloom" />
        {chapter.date ? formatDay(chapter.date) : '——'}
      </div>
      {chapter.summary && <p className="mt-4 max-w-md text-sm leading-relaxed text-travel-ink/70">{chapter.summary}</p>}
      {chapter.itinerary.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {chapter.itinerary.slice(0, 5).map((it) => (
            <span key={it.id} className="inline-flex items-center gap-1 rounded-full bg-travel-mist/40 px-2.5 py-1 text-[11px] text-travel-ink/70">
              <MapPin className="h-3 w-3 text-travel-bloom" />
              {it.title}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function PhotoSpread({ chapter, photo }: { chapter: BookChapter; photo: BookPhoto }) {
  const realSrc = photo.previewUrl || photo.thumbnailUrl
  const [paint, setPaint] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'done' | 'none'>('loading')

  // 按需生成该照片的油画版（生成后缓存,后端只生成一次）
  useEffect(() => {
    let alive = true
    if (!realSrc) { setState('none'); return }
    fetch(`/api/travel-book/oil?url=${encodeURIComponent(realSrc)}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => { if (alive) { if (j?.url) { setPaint(j.url); setState('done') } else { setState('none') } } })
      .catch(() => { if (alive) setState('none') })
    return () => { alive = false }
  }, [realSrc])

  const paintSrc = paint || realSrc // 失败/未配置回退原图
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        {/* 左(桌面)：原图 */}
        <div className="relative min-h-0 flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={realSrc || ''} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute left-2 top-2 rounded-full bg-black/35 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white">原图</span>
        </div>
        {/* 右(桌面)：油画版 */}
        <div className="relative min-h-0 flex-1 border-t border-travel-dim/40 sm:border-l sm:border-t-0">
          {state === 'loading' || state === 'none' ? (
            <div className="flex h-full items-center justify-center bg-travel-sakura/20">
              <span className="animate-pulse text-[11px] tracking-widest text-travel-ink/50">
                {state === 'loading' ? '油画生成中…' : '油画暂不可用'}
              </span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={paintSrc || ''} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <span className="absolute right-2 top-2 rounded-full bg-black/35 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white">油画</span>
        </div>
      </div>
      <div className="flex items-center justify-between pt-2.5 text-[10px] uppercase tracking-[0.2em] text-travel-ink/45">
        <span>Chapter {String(chapter.index).padStart(2, '0')}</span>
        <span>{chapter.date ? formatDay(chapter.date) : ''}</span>
      </div>
    </div>
  )
}

function CoverPage({ book }: { book: Book }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        {book.coverPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.coverPreview} alt={book.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-travel-sakura/30">
            <Camera className="h-10 w-10 text-travel-bloom/50" />
          </div>
        )}
      </div>
      <div className="py-3 text-center">
        <div className="font-display text-2xl font-bold text-travel-ink">{book.title}</div>
        {book.location && (
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-travel-ink/60">
            <MapPin className="h-3.5 w-3.5" />
            {book.location}
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryPage({ book }: { book: Book }) {
  const stats = [
    { label: '天数', value: book.dayCount || book.chapters.length },
    { label: '照片', value: book.photoCount },
  ]
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="font-display text-[10px] font-semibold uppercase tracking-[0.4em] text-travel-bloom">End · 旅行总结</div>
      <h2 className="font-display mt-4 text-2xl font-bold text-travel-ink">{book.title}</h2>
      <div className="mt-6 grid grid-cols-2 gap-6">
        {stats.map((s) => (
          <div key={s.label} className="border-t border-travel-bloom/40 pt-3">
            <div className="font-display text-3xl font-bold text-travel-accent">{s.value}</div>
            <div className="mt-1 text-xs tracking-widest text-travel-ink/50">{s.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-8 text-sm text-travel-ink/60">谢谢翻阅，收藏这段路上的时光。</p>
    </div>
  )
}

function PageBody({ page, book }: { page: Page; book: Book }) {
  switch (page.kind) {
    case 'cover': return <CoverPage book={book} />
    case 'chapter': return <ChapterIntro chapter={page.chapter} />
    case 'photo': return <PhotoSpread chapter={page.chapter} photo={page.photo} />
    case 'summary': return <SummaryPage book={book} />
    default: return null
  }
}

export default function BookReader({ book, onBack }: { book: Book; onBack: () => void }) {
  const pages = useMemo(() => buildPages(book), [book])
  const [pageIndex, setPageIndex] = useState(0) // 当前页索引（桌面=右页）
  const [turn, setTurn] = useState<'next' | 'prev' | null>(null)
  const timer = useRef<number | null>(null)

  // 视口：桌面双页 / 移动单页 + 自适应尺寸
  const [vp, setVp] = useState({ w: 1280, h: 800 })
  useEffect(() => {
    const onR = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    onR()
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [])
  const isDesktop = vp.w >= 640
  const pageW = Math.round(isDesktop ? Math.min(440, (vp.w - 190) / 2) : Math.min(vp.w * 0.92, 460))
  const pageH = Math.round(Math.min(pageW * 1.25, vp.h - 200))

  const total = pages.length
  const canNext = pageIndex < total - 1
  const canPrev = pageIndex > 0

  const go = useCallback((next: number) => {
    if (turn || next < 0 || next > total - 1 || next === pageIndex) return
    setTurn(next > pageIndex ? 'next' : 'prev')
    if (timer.current) window.clearTimeout(timer.current)
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    timer.current = window.setTimeout(() => {
      setPageIndex(next)
      setTurn(null)
    }, reduce ? 0 : 430)
  }, [pageIndex, total, turn])

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  // 键盘翻页
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(pageIndex + 1)
      else if (e.key === 'ArrowLeft') go(pageIndex - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, pageIndex])

  // 触屏滑动
  const touchX = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (dx < -50) go(pageIndex + 1)
    else if (dx > 50) go(pageIndex - 1)
  }

  const current = pages[pageIndex]
  const leftPage = pageIndex > 0 ? pages[pageIndex - 1] : null
  const revealed = turn === 'next'
    ? (pageIndex + 1 < total ? pages[pageIndex + 1] : current)
    : turn === 'prev'
      ? (pageIndex - 1 >= 0 ? pages[pageIndex - 1] : current)
      : current
  const flipPage = turn ? (turn === 'prev' && isDesktop ? leftPage : current) : null
  const prevLeft = turn === 'prev' && pageIndex - 2 >= 0 ? pages[pageIndex - 2] : null

  const navBtn = 'inline-flex items-center gap-1 rounded-full bg-travel-sakura/60 px-3 py-1.5 text-xs font-medium text-travel-ink hover:bg-travel-sakura disabled:opacity-40'

  return (
    <div className="fixed inset-0 z-[105] flex flex-col bg-travel-cream">
      <header className="flex items-center justify-between border-b border-travel-dim/40 px-4 py-2.5">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-full bg-travel-sakura/60 px-3 py-1.5 text-xs font-medium text-travel-ink hover:bg-travel-sakura">
          <ChevronLeft className="h-3.5 w-3.5" />
          我的旅行画册
        </button>
        <div className="font-display text-sm font-semibold text-travel-ink">{book.title}</div>
        <button type="button" onClick={onBack} aria-label="关闭" className="rounded-full p-2 text-travel-ink/60 hover:bg-travel-sakura/40 hover:text-travel-ink">
          <X className="h-4 w-4" />
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center overflow-hidden px-3 py-4" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => go(pageIndex - 1)} disabled={!canPrev} aria-label="上一页"
            className={`${navBtn} hidden sm:inline-flex`}>
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* 书（透视容器） */}
          <div className="book-scene" style={{ perspective: '2600px' }}>
            <div className="book" style={{ width: isDesktop ? pageW * 2 : pageW, height: pageH, position: 'relative' }}>
              {/* 底部页（翻开后露出的页 / 静态页） */}
              <div
                style={{ position: 'absolute', inset: 0, zIndex: 2 }}
                className="book-paper flex items-center justify-center overflow-hidden rounded-[3px]"
              >
                {isDesktop ? (
                  <div className="flex h-full w-full">
                    <div className="flex h-full w-1/2 items-center justify-center overflow-hidden rounded-l-[3px]">
                      {turn === 'prev' ? (prevLeft ? <PageBody page={prevLeft} book={book} /> : null) : leftPage ? <PageBody page={leftPage} book={book} /> : null}
                    </div>
                    <div className="flex h-full w-1/2 items-center justify-center overflow-hidden rounded-r-[3px]">
                      {turn === 'next' ? <PageBody page={revealed} book={book} /> : <PageBody page={current} book={book} />}
                    </div>
                  </div>
                ) : (
                  <div className="h-full w-full">
                    <PageBody page={revealed} book={book} />
                  </div>
                )}
              </div>

              {/* 翻转页 */}
              {turn && (
                <div
                  className={turn === 'next' ? 'book-flip-next' : 'book-flip-prev'}
                  style={{
                    position: 'absolute', top: 0, zIndex: 5,
                    width: isDesktop ? pageW : pageW, height: pageH,
                    ...(isDesktop ? (turn === 'next' ? { right: 0 } : { left: 0 }) : { left: 0 }),
                    transformOrigin: isDesktop ? (turn === 'next' ? 'left center' : 'right center') : (turn === 'next' ? 'left center' : 'right center'),
                    backfaceVisibility: 'hidden',
                  }}
                >
                  <div className="book-paper h-full w-full overflow-hidden rounded-[3px]">
                    <PageBody page={flipPage as Page} book={book} />
                  </div>
                </div>
              )}

              {/* 书脊（仅桌面） */}
              {isDesktop && (
                <div style={{ position: 'absolute', left: pageW - 1, top: 0, width: 2, height: pageH, zIndex: 4 }}
                  className="bg-gradient-to-b from-black/10 via-black/25 to-black/10" />
              )}
            </div>
          </div>

          <button type="button" onClick={() => go(pageIndex + 1)} disabled={!canNext} aria-label="下一页"
            className={`${navBtn} hidden sm:inline-flex`}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </main>

      <footer className="flex items-center justify-center gap-3 border-t border-travel-dim/40 px-4 py-3">
        <button type="button" onClick={() => go(pageIndex - 1)} disabled={!canPrev} className={navBtn}>
          <ChevronLeft className="h-3.5 w-3.5" />上一页
        </button>
        <div className="flex flex-wrap justify-center gap-1">
          {pages.map((_, i) => (
            <button key={i} type="button" onClick={() => go(i)} aria-label={`第 ${i + 1} 页`}
              className={`h-1.5 w-1.5 rounded-full transition-all ${i === pageIndex ? 'bg-travel-bloom' : 'bg-travel-dim/40'}`} />
          ))}
        </div>
        <button type="button" onClick={() => go(pageIndex + 1)} disabled={!canNext} className={navBtn}>
          下一页<ChevronRight className="h-3.5 w-3.5" />
        </button>
      </footer>
    </div>
  )
}
