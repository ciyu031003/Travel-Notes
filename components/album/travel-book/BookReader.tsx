'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, List, X } from 'lucide-react'
import type { Book, BookChapter, BookPhoto } from './TravelBook'
import ArtFlipBook, { type ArtFlipBookHandle } from '../reader/ArtFlipBook'
import {
  ArtPageBody,
  photoSpreadFits,
  type ArtPage,
  type PhotoVariant,
} from '../reader/ArtPage'

type Page =
  | { kind: 'cover' }
  | { kind: 'chapter'; chapter: BookChapter }
  | { kind: 'photo'; chapter: BookChapter; photo: BookPhoto; variant: PhotoVariant }
  | { kind: 'blank'; chapter?: BookChapter }
  | { kind: 'summary' }

/** 封面 → 章节标题/照片 → 总结，顺序与 demo 的 page-flip 页面序列一致。 */
type MeasuredMap = Record<number, { w: number; h: number }>

/**
 * 封面 -> 章节标题/照片 -> 总结；
 * - 双页模式（桌面，spreadEnabled=true）：宽高比 ≥ 1.6 的真横屏照片跨两页出血，
 *   其余照片（竖屏 + 4:3/3:2 准横屏）单页 contain 完整展示，头脚绝不裁切；
 * - 单页模式（窄屏，spreadEnabled=false）：所有照片单页 contain 完整展示。
 */
function buildPages(
  book: Book,
  measured: MeasuredMap,
  spreadEnabled: boolean,
): Page[] {
  const pages: Page[] = [{ kind: 'cover' }]
  // 封面之后已排版页数：page-flip 双页模式按 (奇数页, 偶数页) 成对铺开，
  // 跨页照片必须落在奇数页起始，否则左右半页会错位配对。
  let placed = 0
  const push = (page: Page) => {
    pages.push(page)
    placed += 1
  }
  for (const chapter of book.chapters) {
    if (chapter.photos.length === 0) continue
    push({ kind: 'chapter', chapter })
    for (const photo of chapter.photos) {
      // 只有双页模式 + 宽高比足够（≥1.6）的横屏照片才跨页出血；
      // 其余一律单页 contain（竖屏完整展示，准横屏也不会被上下裁切）。
      if (!spreadEnabled || !photoSpreadFits(photo, measured[photo.id] ?? null)) {
        push({ kind: 'photo', chapter, photo, variant: 'single' })
        continue
      }
      // 奇数页落单时先补一张空白衬页，保证跨页左右成对
      if (placed % 2 === 1) push({ kind: 'blank', chapter })
      push({ kind: 'photo', chapter, photo, variant: 'spread-left' })
      push({ kind: 'photo', chapter, photo, variant: 'spread-right' })
    }
  }
  push({ kind: 'summary' })
  return pages
}

function pageToArtPage(page: Page, _book: Book): ArtPage {
  switch (page.kind) {
    case 'cover': return { kind: 'cover' }
    case 'chapter': return { kind: 'chapter', chapter: page.chapter }
    case 'photo': return { kind: 'photo', chapter: page.chapter, photo: page.photo, variant: page.variant }
    case 'blank': return { kind: 'blank', chapter: page.chapter }
    case 'summary': return { kind: 'summary' }
    default: return { kind: 'cover' }
  }
}

export default function BookReader({ book, onBack }: { book: Book; onBack: () => void }) {
  const [measured, setMeasured] = useState<MeasuredMap>({})
  // 桌面双页翻页 / 窄屏单页翻页：交互动画 mode 由 page-flip 的 usePortrait 决定，
  // 超过 768px 使用双页展开（真跨页出血），否则单页完整展示。
  const [isWide, setIsWide] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const sync = () => setIsWide(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    window.addEventListener('resize', sync)
    return () => {
      mq.removeEventListener?.('change', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])
  const onPhotoMeasured = useCallback((id: number, w: number, h: number) => {
    setMeasured((prev) => {
      const cur = prev[id]
      if (cur && cur.w === w && cur.h === h) return prev
      return { ...prev, [id]: { w, h } }
    })
  }, [])
  const pages = useMemo(
    () => buildPages(book, measured, isWide),
    [book, measured, isWide],
  )
  // 各章节引导页在全书中的起始页码（封面跳章用）
  const chapterStarts = useMemo(() => {
    const starts: { chapter: BookChapter; pageIndex: number }[] = []
    pages.forEach((page, i) => {
      if (page.kind === 'chapter') starts.push({ chapter: page.chapter, pageIndex: i })
    })
    return starts
  }, [pages])
  const artFlipRef = useRef<ArtFlipBookHandle>(null)
  const [artPageIndex, setArtPageIndex] = useState(0)
  const [spreadInfo, setSpreadInfo] = useState<{ index: number; total: number } | null>(null)

  const artPages = useMemo(() =>
    pages.map((page, i) => (
      <ArtPageBody
        key={i}
        page={pageToArtPage(page, book)}
        book={book}
        onPhotoMeasure={onPhotoMeasured}
      />
    )),
    [pages, book, onPhotoMeasured],
  )

  const handleArtPageChange = useCallback(
    (idx: number, spreadIndex?: number, spreadTotal?: number) => {
      setArtPageIndex(idx)
      if (typeof spreadIndex === 'number' && typeof spreadTotal === 'number') {
        setSpreadInfo({ index: spreadIndex, total: spreadTotal })
      }
    },
    [],
  )

  // 挂载：若存在「返回墙位置」预留（草稿，滚动恢复由 TravelBook 在 onBack 里执行），
  // 此处只负责把阅读器顶到内容起点，避免从墙点击后继续停在旧位置造成视觉错位。
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 输入框 / 按钮获得焦点时交还给原生行为（如空格触发按钮点击），避免重复翻页
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t instanceof HTMLInputElement ||
          t instanceof HTMLTextAreaElement ||
          t instanceof HTMLSelectElement ||
          t instanceof HTMLButtonElement ||
          t.isContentEditable)
      ) {
        return
      }
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault()
        artFlipRef.current?.flipNext()
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        artFlipRef.current?.flipPrev()
      } else if (e.key === 'Escape') {
        onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const navBtn = 'inline-flex items-center gap-1 rounded-full bg-travel-sakura/70 px-3 py-1.5 text-xs font-medium text-travel-ink transition-colors hover:bg-travel-sakura dark:bg-white/10 dark:text-shell-text dark:hover:bg-white/20'
  const isCover = artPageIndex === 0
  const showChapterJump = isWide && isCover && chapterStarts.length > 0

  return (
    <div className="fixed inset-0 z-[105] flex flex-col bg-travel-cream dark:bg-shell-bg">
      <header className="flex items-center justify-between border-b border-travel-dim/40 px-3 py-2.5 sm:px-4 dark:border-shell-line">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full bg-travel-sakura/60 px-3 py-1.5 text-xs font-medium text-travel-ink transition-colors hover:bg-travel-sakura dark:bg-white/10 dark:text-shell-text dark:hover:bg-white/20"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          返回画册墙
        </button>
        <div className="flex min-w-0 items-center gap-1.5 font-display text-sm font-semibold text-travel-ink dark:text-shell-text">
          <BookOpen className="h-4 w-4 shrink-0 text-travel-bloom" />
          <span className="truncate">{book.title}</span>
        </div>
        <button
          type="button"
          onClick={onBack}
          aria-label="关闭"
          className="rounded-full p-2 text-travel-ink/60 transition-colors hover:bg-travel-sakura/40 hover:text-travel-ink dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-shell-text"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-2 py-2 sm:px-4 sm:py-3">
        <div className={`art-flip-rig${isWide ? '' : ' art-flip-rig--single'}`}>
          <ArtFlipBook
            ref={artFlipRef}
            pages={artPages}
            onPageChange={handleArtPageChange}
            currentPage={artPageIndex}
            portrait={!isWide}
          />
        </div>
        {showChapterJump && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex justify-center">
            <div
              role="group"
              aria-label="章节直达"
              className="pointer-events-auto flex max-w-[min(92%,720px)] items-center gap-1 overflow-x-auto rounded-full border border-travel-dim/50 bg-travel-cream/90 px-2 py-1.5 shadow-[0_8px_24px_-12px_rgba(90,60,40,0.35)] backdrop-blur dark:border-shell-line dark:bg-shell-surface/90 dark:shadow-black/40"
            >
              <List className="mx-1 h-3.5 w-3.5 shrink-0 text-travel-bloom dark:text-travel-bloom" />
              {chapterStarts.map(({ chapter, pageIndex }) => (
                <button
                  key={chapter.index}
                  type="button"
                  onClick={() => artFlipRef.current?.turnToPage(pageIndex)}
                  className="shrink-0 rounded-full px-2.5 py-1 text-xs text-travel-ink/80 transition-colors hover:bg-travel-sakura/80 hover:text-travel-ink dark:text-shell-muted dark:hover:bg-white/10 dark:hover:text-shell-text"
                >
                  DAY {String(chapter.index).padStart(2, '0')} · {chapter.title || `DAY ${String(chapter.index).padStart(2, '0')}`}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="flex items-center justify-between gap-3 border-t border-travel-dim/40 px-3 py-2.5 sm:justify-center sm:px-4 dark:border-shell-line">
        <button type="button" onClick={() => artFlipRef.current?.flipPrev()} className={navBtn}>
          <ChevronLeft className="h-3.5 w-3.5" />上一页
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center sm:flex-none sm:px-5">
          <span
            aria-live="polite"
            className="shrink-0 font-display text-xs tabular-nums text-travel-ink/60 dark:text-shell-muted"
          >
            {String((spreadInfo?.index ?? artPageIndex) + 1).padStart(2, '0')} /{' '}
            {String(spreadInfo?.total ?? artPages.length).padStart(2, '0')}
          </span>
        </div>
        <button type="button" onClick={() => artFlipRef.current?.flipNext()} className={navBtn}>
          下一页<ChevronRight className="h-3.5 w-3.5" />
        </button>
      </footer>
    </div>
  )
}
