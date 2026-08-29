import type { Book } from '@/components/album/travel-book/TravelBook'

/**
 * 旅行画册 → 素描本「图版（Plate / Spread）」。
 * 每张照片 = 一个图版，保证翻页能看到不同照片（此前每章只取首图 hero，导致整本看起来都是同一张）。
 *   cover   → 封面
 *   photo   → 章节里的某一张照片（跨页全出血）
 *   summary → 旅行总结
 * 不调用通义 API：预览图直接用 PREVIEW/THUMBNAIL，素描质感走前端 CSS 滤镜。
 */
export interface Spread {
  index: number
  kind: 'cover' | 'photo' | 'summary'
  title: string
  place: string
  date: string
  image: string
  blur: string
  /** 原图/大图 URL（放大镜、查看大图按需加载；无则回退 image） */
  full?: string
  count: number
  chapterId?: number
  /** 该照片在所属章节内的序号（从 1 开始），用于图版标签与图注 */
  photoNo?: number
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
  const coverImg = book.coverPreview || book.coverThumb || NO_IMG

  spreads.push({
    index: 0,
    kind: 'cover',
    title: book.title,
    place: book.location || '',
    date: iso(book.startDate),
    image: coverImg,
    blur: book.coverBlur || coverImg,
    count: book.photoCount,
  })

  for (const ch of book.chapters) {
    const photos = ch.photos || []
    if (photos.length === 0) continue
    const chTitle = ch.title || `DAY ${String(ch.index).padStart(2, '0')}`
    const place = pickPlace(book, ch.itinerary?.[0]?.locationName)
    const chDate = iso(ch.date)
    // 避免“翻页一直是同一张照片”：封面图若与章节首图相同则不重复作为图版；
    // 同一章节内重复 URL 也只展示一次，保证每次翻页都是新的一页。
    const uniquePhotos: { image: string; blur: string; full?: string }[] = []
    const seenPhotoUrl = new Set<string>()
    for (const photo of photos) {
      const image = photo.previewUrl || photo.thumbnailUrl || NO_IMG
      if (image === coverImg || image === NO_IMG) continue
      if (seenPhotoUrl.has(image)) continue
      seenPhotoUrl.add(image)
      uniquePhotos.push({ image, blur: photo.blurUrl || photo.thumbnailUrl || NO_IMG, full: photo.fullUrl || undefined })
    }
    uniquePhotos.forEach((up, pi) => {
      spreads.push({
        index: spreads.length,
        kind: 'photo',
        title: chTitle,
        place,
        date: chDate,
        image: up.image,
        blur: up.blur,
        full: up.full,
        count: uniquePhotos.length,
        chapterId: ch.id,
        photoNo: pi + 1,
      })
    })
  }

  if (spreads.length > 1) {
    spreads.push({
      index: spreads.length,
      kind: 'summary',
      title: book.title,
      place: book.location || '',
      date: iso(book.endDate || book.startDate),
      image: coverImg,
      blur: book.coverBlur || coverImg,
      count: book.photoCount,
    })
  }
  return spreads
}
