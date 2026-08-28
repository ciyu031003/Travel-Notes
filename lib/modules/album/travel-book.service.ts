/**
 * Travel Book（旅行画册 2.0 Phase 2）：以 Travel 模型驱动一本文艺摄影集。
 * 数据映射：Travel(封面) → TravelDay(章节) → Memory(回忆) → Media(照片)。
 * 复用原图/缩略图/预览三级变体，画册页用 PREVIEW、列表/封面用 THUMBNAIL、大图用 ORIGINAL。
 * 不改 schema、不绕过权限层（scopedWhere 归属/公开过滤）。
 */
import { prisma } from '../../db'
import { scopedWhere } from '../../visibility'
import { skipDbOnBuild } from '../../db-guard'

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

export async function listTravelBooks(userId?: number | null): Promise<TravelBookData[]> {
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
