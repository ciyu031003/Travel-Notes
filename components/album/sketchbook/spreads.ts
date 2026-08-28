import type { Book } from '@/components/album/travel-book/TravelBook'

/**
 * 旅行画册 → 素描本「图版（Plate / Spread）」。
 * 每幅图版 = 一个全出血跨页：
 *   cover   → 封面
 *   chapter → 一天的 hero 主图（保留章节标题/地点/日期/照片数）
 *   summary → 旅行总结（用封面做底 + 统计覆层）
 * 不调用通义 API：预览图直接用 PREVIEW/THUMBNAIL，素描质感走前端 CSS 滤镜。
 */
export interface Spread {
  index: number
  kind: 'cover' | 'chapter' | 'summary'
  title: string
  place: string
  date: string
  image: string
  count: number
  chapterId?: number
}

const NO_IMG = '/icons/placeholder-album.svg'

function iso(v: string | null | undefined): string {
  if (!v) return ''
  try {
    const d = new Date(v)
    return isNaN(d.getTime()) ? '' : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return ''
  }
}

function pickPlace(book: Book, place?: string | null): string {
  if (place) return place
  return book.location || book.title
}

export function buildSpreads(book: Book): Spread[] {
  const spreads: Spread[] = []
  spreads.push({
    index: 0,
    kind: 'cover',
    title: book.title,
    place: book.location || '',
    date: iso(book.startDate),
    image: book.coverPreview || book.coverThumb || NO_IMG,
    count: book.photoCount,
  })
  for (const ch of book.chapters) {
    if (!ch.photos || ch.photos.length === 0) continue
    const hero = ch.photos[0]
    const firstIt = ch.itinerary?.[0]
    spreads.push({
      index: spreads.length,
      kind: 'chapter',
      title: ch.title || `DAY ${String(ch.index).padStart(2, '0')}`,
      place: pickPlace(book, firstIt?.locationName),
      date: iso(ch.date),
      image: hero.previewUrl || hero.thumbnailUrl || NO_IMG,
      count: ch.photos.length,
      chapterId: ch.id,
    })
  }
  if (spreads.length > 1) {
    spreads.push({
      index: spreads.length,
      kind: 'summary',
      title: book.title,
      place: book.location || '',
      date: iso(book.endDate || book.startDate),
      image: book.coverPreview || book.coverThumb || NO_IMG,
      count: book.photoCount,
    })
  }
  return spreads
}

export function chapterOf(book: Book, spread: Spread): Book['chapters'][number] | null {
  if (spread.kind !== 'chapter' || !spread.chapterId) return null
  return book.chapters.find((c) => c.id === spread.chapterId) || null
}
