import { composeBook, type ComposedBook, type ComposerChapter, type ComposerPhoto } from './composer'
import { paginate } from './paginate'
import type { BookPage, BookSpread, BookSpreadMode } from './types'

/**
 * 画册数据装配：把 `/api/travel-book` 返回的 Book 形状映射为 Composer 输入，
 * 产出「逻辑页 + 对开序列」。
 *
 * 纯函数（无 DOM / 无网络），因此可以在浏览器、SSR 与单测里跑同一份逻辑。
 * 之所以不放在服务端：画册版式随**阅读器模式**（单页 / 双页）变化，
 * 而模式只在客户端可知（视口宽度）。服务端只负责给出宽高比等"已知事实"。
 */

/** 与 components/album/travel-book/TravelBook.tsx 中 BookPhoto 对齐（结构化类型，避免循环引用） */
export interface SourcePhoto {
  id: number
  thumbnailUrl: string | null
  previewUrl: string | null
  blurUrl: string | null
  fullUrl: string | null
  width: number | null
  height: number | null
}

export interface SourceChapter {
  id: number
  index: number
  date: string | null
  title: string | null
  summary: string | null
  itinerary: { id: number; title: string; locationName: string | null }[]
  memories: { id: number; title: string; content: string | null; mood: string | null; photos: SourcePhoto[] }[]
  photos: SourcePhoto[]
}

export interface SourceBook {
  bookKey: string
  travelId: number
  title: string
  description: string | null
  location: string | null
  startDate: string | null
  endDate: string | null
  coverThumb: string | null
  coverPreview: string | null
  coverBlur: string | null
  photoCount: number
  chapters: SourceChapter[]
}

/**
 * 照片宽高比。
 * - 服务端给了 width/height 就用真实比例（画册版式依赖它）；
 * - 缺失时给 0.75（竖向 3:4）作为安全缺省：**不会**被判定为跨页出血，
 *   宁可整页 contain 完整展示，也不冒"裁掉头脚"的风险。
 */
export const FALLBACK_ASPECT = 0.75

function toPhoto(src: SourcePhoto, locationName: string | null, memoryId: number | null): ComposerPhoto {
  const w = src.width
  const h = src.height
  const aspect = w && h && w > 0 && h > 0 ? w / h : FALLBACK_ASPECT
  return {
    mediaId: src.id,
    fullUrl: src.fullUrl,
    thumbnailUrl: src.thumbnailUrl,
    previewUrl: src.previewUrl,
    blurUrl: src.blurUrl,
    aspect,
    takenAt: null,
    locationName,
    memoryId,
  }
}

/** 把一章映射为 Composer 输入：照片带上「被哪条回忆引用」与地点 */
export function toComposerChapter(chapter: SourceChapter): ComposerChapter {
  // 回忆 → 照片绑定（用于"有故事的照片优先入选"）
  const memoryOfPhoto = new Map<number, number>()
  for (const mem of chapter.memories ?? []) {
    for (const p of mem.photos ?? []) {
      if (!memoryOfPhoto.has(p.id)) memoryOfPhoto.set(p.id, mem.id)
    }
  }
  // 地点：照片自身无 Location 关联（当前 schema 里 Location 挂在 Memory / ItineraryItem 上），
  // 这里按"回忆 → 其地点"最近可用地退到本章第一个有地点的行程点。
  // 刻意不逐张编造地点：编错地点比不显示地点更糟。
  const fallbackLocation = chapter.itinerary.find((it) => it.locationName)?.locationName ?? null

  const seen = new Set<number>()
  const photos: ComposerPhoto[] = []
  for (const p of chapter.photos ?? []) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    photos.push(toPhoto(p, fallbackLocation, memoryOfPhoto.get(p.id) ?? null))
  }

  return {
    index: chapter.index,
    title: chapter.title,
    date: chapter.date,
    summary: chapter.summary,
    itinerary: (chapter.itinerary ?? []).map((it) => ({ title: it.title, locationName: it.locationName })),
    photos,
  }
}

const COVER_BLUR_PLACEHOLDER: SourcePhoto = {
  id: -1,
  thumbnailUrl: null,
  previewUrl: null,
  blurUrl: null,
  fullUrl: null,
  width: null,
  height: null,
}

/** Book → Composer 输入 → 编排结果（逻辑页 + 附录 + 统计） */
export function composeFromSourceBook(book: SourceBook, targetPages?: number): ComposedBook {
  const coverSource: SourcePhoto | null =
    book.coverPreview || book.coverThumb || book.coverBlur
      ? { ...COVER_BLUR_PLACEHOLDER, previewUrl: book.coverPreview, thumbnailUrl: book.coverThumb, blurUrl: book.coverBlur }
      : null

  return composeBook({
    bookKey: book.bookKey,
    title: book.title,
    location: book.location,
    startDate: book.startDate,
    endDate: book.endDate,
    chapters: (book.chapters ?? []).map(toComposerChapter),
    coverPhoto: coverSource ? toPhoto(coverSource, book.location, null) : null,
    targetPages,
  })
}

/** 编排结果 → 阅读器消费的对开序列 */
export function toSpreads(pages: BookPage[], mode: BookSpreadMode): BookSpread[] {
  return paginate(pages, mode)
}
