/**
 * Travel Book（旅行画册 2.0 Phase 2）：把一次旅行编排成一本「旅行摄影杂志」。
 * 数据来源（自动聚合，无需手动创建）：
 *  - Travel 模型：Travel(封面) → TravelDay(章节) → Memory(回忆) → Media(照片)。有 Travel 数据时优先。
 *  - Post 旅行文章：按城市/日期自动生成画册（覆盖绝大多数存量内容，Travel 为 0 时也能出册）。
 * 复用原图/缩略图/预览三级变体，列表/封面用 THUMBNAIL、画册页用 PREVIEW。
 * 不改 schema、不绕过权限层（scopedWhere 归属/公开过滤）。
 */
import { prisma } from '../../db'
import { scopedWhere } from '../../visibility'
import { skipDbOnBuild } from '../../db-guard'
import { getPostService } from '../../container'
import { findCityByName } from '../../../data/cities'

export interface TravelBookChapterPhoto {
  id: number
  thumbnailUrl: string | null
  previewUrl: string | null
  width: number | null
  height: number | null
}

export interface TravelBookChapter {
  id: number
  index: number
  date: string | null
  title: string | null
  summary: string | null
  itinerary: { id: number; title: string; startTime: string | null; endTime: string | null; type: string; notes: string | null; locationName: string | null }[]
  memories: { id: number; title: string; content: string | null; mood: string | null; happenedAt: string | null; photos: TravelBookChapterPhoto[] }[]
  photos: TravelBookChapterPhoto[]
}

export interface TravelBookData {
  travelId: number
  slug: string
  title: string
  description: string | null
  location: string | null
  startDate: string | null
  endDate: string | null
  travelType: string | null
  companions: unknown
  coverThumb: string | null
  coverPreview: string | null
  dayCount: number
  photoCount: number
  chapters: TravelBookChapter[]
}

function iso(v: Date | string | null | undefined): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function storageBase(): string | null {
  if (process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET) {
    return (process.env.STORAGE_PUBLIC_BASE_URL || process.env.STORAGE_ENDPOINT).replace(/\/+$/, '')
  }
  return null
}

function mediaUrl(storageKey: string): string {
  const base = storageBase()
  return base ? `${base}/${storageKey}` : `/uploads/${storageKey}`
}

function variantOf(media: any, variant: string): string | null {
  const v = media?.variants?.find((x: any) => x.variant === variant)
  return v?.storageKey ? mediaUrl(v.storageKey) : null
}

function toPhoto(m: any): TravelBookChapterPhoto {
  return {
    id: m.id,
    thumbnailUrl: variantOf(m, 'THUMBNAIL') ?? mediaUrl(m.storageKey),
    previewUrl: variantOf(m, 'PREVIEW') ?? mediaUrl(m.storageKey),
    width: m.width ?? null,
    height: m.height ?? null,
  }
}

async function listTravelModelBooks(userId?: number | null): Promise<TravelBookData[]> {
  if (skipDbOnBuild()) return []

  const travels = await prisma.travel.findMany({
    where: scopedWhere(userId, 'ownerId') as any,
    orderBy: { startDate: 'desc' },
    include: {
      coverMedia: { include: { variants: true } },
      days: {
        orderBy: { sortOrder: 'asc' },
        include: {
          itineraryItems: {
            orderBy: { sortOrder: 'asc' },
            include: { location: { select: { name: true } } },
          },
          memories: {
            orderBy: { happenedAt: 'asc' },
            include: {
              media: { include: { variants: true } },
              mediaLinks: { include: { media: { include: { variants: true } } } },
            },
          },
        },
      },
    },
  })

  return travels.map((travel: any) => {
    let photoCount = 0
    const chapters: TravelBookChapter[] = (travel.days || []).map((d: any, idx: number) => {
      const memories = (d.memories || []).map((mem: any) => {
        const primary = (mem.media || []).map(toPhoto)
        const linked = (mem.mediaLinks || []).map((l: any) => toPhoto(l.media))
        const seen = new Set<number>()
        const photos = [...primary, ...linked].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
        photoCount += photos.length
        return {
          id: mem.id,
          title: mem.title,
          content: mem.content ?? null,
          mood: mem.mood ?? null,
          happenedAt: iso(mem.happenedAt),
          photos,
        }
      })
      const seen = new Set<number>()
      const photos = memories.flatMap((mem: any) => mem.photos).filter((p: any) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
      return {
        id: d.id,
        index: idx + 1,
        date: iso(d.date),
        title: d.title,
        summary: d.summary,
        itinerary: (d.itineraryItems || []).map((it: any) => ({
          id: it.id,
          title: it.title,
          startTime: iso(it.startTime),
          endTime: iso(it.endTime),
          type: it.type,
          notes: it.notes,
          locationName: it.location?.name ?? null,
        })),
        memories,
        photos,
      }
    })

    return {
      travelId: travel.id,
      slug: travel.slug,
      title: travel.title,
      description: travel.description ?? null,
      location: travel.location ?? null,
      startDate: iso(travel.startDate),
      endDate: iso(travel.endDate),
      travelType: travel.travelType ?? null,
      companions: travel.companions ?? null,
      coverThumb: travel.coverMedia ? (variantOf(travel.coverMedia, 'THUMBNAIL') ?? mediaUrl(travel.coverMedia.storageKey)) : (travel.cover ?? null),
      coverPreview: travel.coverMedia ? (variantOf(travel.coverMedia, 'PREVIEW') ?? mediaUrl(travel.coverMedia.storageKey)) : (travel.cover ?? null),
      dayCount: (travel.days || []).length,
      photoCount,
      chapters,
    }
  })
}

/**
 * 从存量旅行文章（Post）按城市自动生成画册：无需手动创建 Travel 记录。
 * 每个城市 = 一本画册；按日期聚合为章节；照片 = 文章封面+图片。
 */
async function listPostCityBooks(userId?: number | null): Promise<TravelBookData[]> {
  if (skipDbOnBuild()) return []
  const postService = getPostService()
  const posts = await postService.getPostsHybrid('travel', userId)
  if (!posts || posts.length === 0) return []

  interface Chap {
    date: string | null
    title: string
    summary: string | null
    photos: TravelBookChapterPhoto[]
  }
  interface CityBox {
    name: string
    location: string
    days: Map<string, Chap>
    photos: TravelBookChapterPhoto[]
  }
  const cityMap = new Map<string, CityBox>()
  const urlPhoto = new Map<string, TravelBookChapterPhoto>()
  let photoSeq = 1
  const toUrlPhoto = (url: string): TravelBookChapterPhoto => {
    let existing = urlPhoto.get(url)
    if (!existing) {
      existing = { id: photoSeq++, thumbnailUrl: url, previewUrl: url, width: null, height: null }
      urlPhoto.set(url, existing)
    }
    return existing
  }

  for (const post of posts) {
    if (!post.location) continue
    const city = findCityByName(post.location)
    const name = city?.name ?? post.location
    const raw = [...(post.cover ? [post.cover] : []), ...((post.images as string[]) || [])]
    if (raw.length === 0) continue
    const imgs = raw.filter((u) => !(!u)).map(toUrlPhoto)

    let box = cityMap.get(name)
    if (!box) {
      box = { name, location: post.location, days: new Map(), photos: [] }
      cityMap.set(name, box)
    }
    const date = post.date ?? ''
    let chap = box.days.get(date)
    if (!chap) {
      chap = { date: post.date ?? null, title: post.title, summary: post.description ?? null, photos: [] }
      box.days.set(date, chap)
    }
    const seenChap = new Set<number>(chap.photos.map((p) => p.id))
    for (const p of imgs) if (!seenChap.has(p.id)) chap.photos.push(p)
    const seenBox = new Set<number>(box.photos.map((p) => p.id))
    for (const p of imgs) if (!seenBox.has(p.id)) box.photos.push(p)
  }

  const books: TravelBookData[] = []
  let chapterSeq = 1
  for (const box of Array.from(cityMap.values())) {
    const days = Array.from(box.days.values())
    const chapters: TravelBookChapter[] = days.map((d) => ({
      id: chapterSeq++,
      index: 0, // 下方按序重排
      date: d.date,
      title: d.title,
      summary: d.summary,
      itinerary: [],
      memories: d.photos.length
        ? [{ id: d.photos[0].id, title: d.title, content: d.summary, mood: null, happenedAt: d.date, photos: d.photos }]
        : [],
      photos: d.photos,
    }))
    chapters.forEach((c, i) => (c.index = i + 1))
    books.push({
      travelId: 0,
      slug: '',
      title: box.name,
      description: box.photos.length ? `${box.photos.length} 张照片 · ${chapters.length} 天` : null,
      location: box.location,
      startDate: days[0]?.date ?? null,
      endDate: null,
      travelType: null,
      companions: null,
      coverThumb: box.photos[0]?.thumbnailUrl ?? null,
      coverPreview: box.photos[0]?.previewUrl ?? null,
      dayCount: days.length,
      photoCount: box.photos.length,
      chapters,
    })
  }

  // 按最新日期排序（取每个城市最晚章节日期）
  books.sort((a, b) => new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime())
  return books
}

/** 旅行画册数据：合并「Travel 模型画册」+「旅行文章(Post)城市画册」，Travel 优先。 */
export async function listTravelBooks(userId?: number | null): Promise<TravelBookData[]> {
  const [travelBooks, cityBooks] = await Promise.all([
    listTravelModelBooks(userId),
    listPostCityBooks(userId),
  ])
  return [...travelBooks, ...cityBooks]
}
