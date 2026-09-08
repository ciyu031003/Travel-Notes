'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { Book, BookChapter, BookPhoto } from './TravelBook'
import ArtFlipBook, { type ArtFlipBookHandle } from '../reader/ArtFlipBook'
import { ArtPageBody, type ArtPage } from '../reader/ArtPage'

type Page =
  | { kind: 'cover' }
  | { kind: 'chapter'; chapter: BookChapter }
  | { kind: 'photo'; chapter: BookChapter; photo: BookPhoto }
  | { kind: 'summary' }

/** 封面 → 章节标题/照片 → 总结，顺序与 demo 的 page-flip 页面序列一致。 */
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

function pageToArtPage(page: Page, _book: Book): ArtPage {
  switch (page.kind) {
    case 'cover': return { kind: 'cover' }
    case 'chapter': return { kind: 'chapter', chapter: page.chapter }
    case 'photo': return { kind: 'photo', chapter: page.chapter, photo: page.photo }
    case 'summary': return { kind: 'summary' }
    default: return { kind: 'cover' }
  }
}

export default function BookReader({ book, onBack }: { book: Book; onBack: () => void }) {
  const pages = useMemo(() => buildPages(book), [book])
  const artFlipRef = useRef<ArtFlipBookHandle>(null)
  const [artPageIndex, setArtPageIndex] = useState(0)

  const artPages = useMemo(() =>
    pages.map((page, i) => (
      <ArtPageBody key={i} page={pageToArtPage(page, book)} book={book} />
    )),
    [pages, book],
  )

  const handleArtPageChange = useCallback((idx: number) => {
    setArtPageIndex(idx)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') artFlipRef.current?.flipNext()
      else if (e.key === 'ArrowLeft') artFlipRef.current?.flipPrev()
      else if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const navBtn = 'inline-flex items-center gap-1 rounded-full bg-travel-sakura/70 px-3 py-1.5 text-xs font-medium text-travel-ink transition-colors hover:bg-travel-sakura'

  return (
    <div className="fixed inset-0 z-[105] flex flex-col bg-travel-cream">
      <header className="flex items-center justify-between border-b border-travel-dim/40 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full bg-travel-sakura/60 px-3 py-1.5 text-xs font-medium text-travel-ink transition-colors hover:bg-travel-sakura"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          我的旅行画册
        </button>
        <div className="flex min-w-0 items-center gap-1.5 font-display text-sm font-semibold text-travel-ink">
          <BookOpen className="h-4 w-4 shrink-0 text-travel-bloom" />
          <span className="truncate">{book.title}</span>
        </div>
        <button
          type="button"
          onClick={onBack}
          aria-label="关闭"
          className="rounded-full p-2 text-travel-ink/60 transition-colors hover:bg-travel-sakura/40 hover:text-travel-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center overflow-hidden px-2 py-2 sm:px-4 sm:py-3">
        <div className="art-flip-rig">
          <ArtFlipBook
            ref={artFlipRef}
            pages={artPages}
            onPageChange={handleArtPageChange}
            currentPage={artPageIndex}
          />
        </div>
      </main>

      <footer className="flex items-center justify-between gap-3 border-t border-travel-dim/40 px-3 py-2.5 sm:justify-center sm:px-4">
        <button type="button" onClick={() => artFlipRef.current?.flipPrev()} className={navBtn}>
          <ChevronLeft className="h-3.5 w-3.5" />上一页
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center sm:flex-none sm:px-5">
          <span className="shrink-0 font-display text-xs tabular-nums text-travel-ink/60">
            {String(artPageIndex + 1).padStart(2, '0')} / {String(artPages.length).padStart(2, '0')}
          </span>
        </div>
        <button type="button" onClick={() => artFlipRef.current?.flipNext()} className={navBtn}>
          下一页<ChevronRight className="h-3.5 w-3.5" />
        </button>
      </footer>
    </div>
  )
}
