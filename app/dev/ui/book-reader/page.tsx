'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamicImport from 'next/dynamic'
import type { Book, BookChapter, BookPhoto } from '@/components/album/travel-book/TravelBook'

/**
 * 画册阅读器调试页（仅开发环境公开）
 * ---------------------------------------------------------------------------
 * 用本地样张构造一本 3 章 / 12 页的画册，验证「翻页手感」。
 * 必须**点击后**才挂载阅读器：BookReader 会用 useCloseOnBack 压一条历史，
 * 直接首屏挂载（没有用户手势/历史）在浏览器里会被同一条历史回退关掉。
 * 真实入口也是 dynamic(ssr:false) + 点击打开，这里与线上路径一致。
 */
const BookReader = dynamicImport(() => import('@/components/album/travel-book/BookReader'), {
  ssr: false,
  loading: () => null,
})

const MEDIA = (n: number) => '/uploads/media/' + n + '.jpg'

function photo(id: number): BookPhoto {
  const url = MEDIA((id % 14) + 1)
  return { id, thumbnailUrl: url, previewUrl: url, blurUrl: null, fullUrl: url, width: 1368, height: 1024 }
}

function chapter(index: number, date: string, title: string, summary: string, ids: number[]): BookChapter {
  return {
    id: 100 + index,
    index,
    date,
    title,
    summary,
    itinerary: [{ id: index * 10 + 1, title: '抵达与散步', locationName: '古城' }],
    memories: [{ id: index * 20 + 1, title: '在路上', content: '风很大，云跑得比车快。', mood: 'EASY', photos: [photo(ids[0])] }],
    photos: ids.map(photo),
  }
}

const BOOK: Book = {
  bookKey: 'dev:book-reader',
  travelId: 9001,
  slug: 'dev-book-reader',
  title: '川西环线 · 翻页手感',
  description: '拖动书页右下角、或左右滑动，验证翻页动效。',
  location: '四川 甘孜',
  startDate: '2026-10-18',
  endDate: '2026-10-23',
  travelType: 'ALONE',
  companions: null,
  coverThumb: MEDIA(1),
  coverPreview: MEDIA(1),
  coverBlur: null,
  dayCount: 5,
  photoCount: 12,
  chapters: [
    chapter(0, '2026-10-18', '第一天 · 折多山', '从成都出发，翻过折多山，云在脚下。', [1, 2, 3, 4]),
    chapter(1, '2026-10-20', '第三天 · 塔公草原', '草原的风把经幡吹得哗哗响。', [5, 6, 7, 8]),
    chapter(2, '2026-10-22', '第五天 · 冷嘎措', '等一场日照金山，冷得发抖也值得。', [9, 10, 11, 12]),
  ],
}

export default function BookReaderPreviewPage() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const book = useMemo(() => BOOK, [])

  if (!mounted) return null
  if (open) return <BookReader book={book} onBack={() => setOpen(false)} />

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-4 px-6">
      <h1 className="text-[18px] font-bold text-[var(--m-text)]">画册翻页 · 手感预览</h1>
      <p className="text-center text-[13px] leading-6 text-[var(--m-muted)]">
        点击后打开阅读器（与 /album 里点开画册同一个组件）。<br />验证：右下角拖拽折角、左右滑动、点右半页。
      </p>
      <button type="button" className="m-btn m-btn-primary w-full" onClick={() => setOpen(true)}>
        打开预览画册
      </button>
    </main>
  )
}
