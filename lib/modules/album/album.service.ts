/**
 * Album：纪念相册（基于独立 Media 模型 + 对象/本地存储）
 */
import { prisma } from '../../db'
import { scopedWhere } from '../../visibility'
import { randomUUID } from 'crypto'
import { getStorageService } from '../../infrastructure/storage'
import { generateMediaVariants } from '../../infrastructure/media-variants'
import {
  validateAndSanitizeImage,
  MAX_IMAGE_COUNT,
} from '../../infrastructure/media-validation'

export interface AlbumItem {
  id: number
  title: string
  description: string | null
  coverUrl: string | null
  mediaCount: number
  date: string | null
  createdAt: string
  updatedAt: string
  visibility: string
  spaceId: number | null
  userId: number | null
  coverMediaId: number | null
  locationId: number | null
  /** v3.1 M1-A1：关联旅行（一个相册 = 一次旅行/一座城市） */
  travelId: number | null
  /** 多元场景：关联旅行的类型/同行者（相册按类型分组 + 按同行者筛选） */
  travelType: string | null
  companions: unknown
}

export interface AlbumMediaItem {
  id: number
  url: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  createdAt: string
  /** 三级缩略（Stage C2）：列表/详情/原图按需取用 */
  thumbnailUrl?: string | null
  previewUrl?: string | null
}

function variantUrl(media: any, variant: string): string | null {
  const v = media?.variants?.find((x: any) => x.variant === variant)
  return v?.storageKey ? mediaPublicUrl(v.storageKey) : null
}

export interface UploadFile {
  name: string
  buffer: Buffer
  mimeType: string
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** 根据存储配置计算媒体的公开访问 URL */
export function mediaPublicUrl(storageKey: string): string {
  if (process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET) {
    const base = (process.env.STORAGE_PUBLIC_BASE_URL || process.env.STORAGE_ENDPOINT).replace(/\/+$/, '')
    return `${base}/${storageKey}`
  }
  return `/uploads/${storageKey}`
}

function mapAlbum(a: any): AlbumItem {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    coverUrl: a.coverMedia
      ? (variantUrl(a.coverMedia, 'THUMBNAIL') ?? mediaPublicUrl(a.coverMedia.storageKey))
      : null,
    mediaCount: a._count?.items ?? 0,
    date: a.date ? (a.date instanceof Date ? a.date.toISOString() : String(a.date)) : null,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
    updatedAt: a.updatedAt instanceof Date ? a.updatedAt.toISOString() : String(a.updatedAt),
    visibility: a.visibility ?? 'SPACE',
    spaceId: a.spaceId ?? null,
    userId: a.userId ?? null,
    coverMediaId: a.coverMediaId ?? null,
    locationId: a.locationId ?? null,
    travelId: a.travelId ?? null,
    travelType: a.travel?.travelType ?? null,
    companions: a.travel?.companions ?? null,
  }
}

export async function listAlbums(userId?: number | null): Promise<AlbumItem[]> {
  const rows = await prisma.album.findMany({
    where: scopedWhere(userId) as any,
    orderBy: { createdAt: 'desc' },
    include: {
      coverMedia: { include: { variants: true } },
      _count: { select: { items: true } },
      // 多元场景：附带关联旅行的类型/同行者，供相册按类型分组 + 按同行者筛选
      travel: { select: { travelType: true, companions: true } },
    },
  })
  return rows.map(mapAlbum)
}

export async function getAlbum(albumId: number, userId?: number | null): Promise<AlbumItem & { media: AlbumMediaItem[] } | null> {
  const album = await prisma.album.findFirst({
    where: { ...scopedWhere(userId), id: albumId } as any,
    include: {
      coverMedia: { include: { variants: true } },
      _count: { select: { items: true } },
      items: {
        orderBy: { sortOrder: 'asc' },
        include: { media: { include: { variants: true } } },
      },
    },
  })
  if (!album) return null
  return {
    ...mapAlbum(album),
    media: album.items
      .map((it: any) => it.media)
      .filter(Boolean)
      .map((m: any) => ({
        id: m.id,
        url: mediaPublicUrl(m.storageKey),
        mimeType: m.mimeType,
        size: m.size,
        width: m.width,
        height: m.height,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
        thumbnailUrl: variantUrl(m, 'THUMBNAIL'),
        previewUrl: variantUrl(m, 'PREVIEW'),
      })),
  }
}

export interface CreateAlbumInput {
  title: string
  description?: string
  date?: string
  userId?: number | null
  isPublic?: boolean
  /** v3.1 M1-A1：关联旅行 */
  travelId?: number | null
}

export async function createAlbum(input: CreateAlbumInput): Promise<{ id: number }> {
  const row = await prisma.album.create({
    data: {
      title: input.title,
      description: input.description || null,
      date: input.date ? new Date(input.date) : null,
      userId: input.userId ?? null,
      isPublic: input.isPublic ?? false,
      travelId: input.travelId ?? null,
    },
  })
  return { id: row.id }
}

export async function updateAlbum(id: number, input: Partial<CreateAlbumInput>): Promise<void> {
  const data: any = {}
  if (input.title !== undefined) data.title = input.title
  if (input.description !== undefined) data.description = input.description || null
  if (input.date !== undefined) data.date = input.date ? new Date(input.date) : null
  if (input.isPublic !== undefined) data.isPublic = input.isPublic
  if (input.travelId !== undefined) data.travelId = input.travelId || null
  await prisma.album.update({ where: { id }, data })
}

/**
 * 删除前引用检查：同一 Media 可挂多个相册（AlbumMedia @@unique([albumId, mediaId])），
 * 也可能被回忆引用（MemoryMedia）。仍被引用的媒体只解除当前关联，不删 Media 记录与存储文件，
 * 避免删 A 相册打碎 B 相册/回忆里的同一张图。
 */
async function mediaReferencedElsewhere(mediaIds: number[], excludeAlbumId?: number): Promise<Set<number>> {
  const refs = new Set<number>()
  if (mediaIds.length === 0) return refs
  const [otherAlbumLinks, memoryLinks] = await Promise.all([
    prisma.albumMedia.findMany({
      where: {
        mediaId: { in: mediaIds },
        ...(excludeAlbumId ? { albumId: { not: excludeAlbumId } } : {}),
      },
      select: { mediaId: true },
    }),
    prisma.memoryMedia.findMany({ where: { mediaId: { in: mediaIds } }, select: { mediaId: true } }),
  ])
  for (const l of otherAlbumLinks) refs.add(l.mediaId)
  for (const l of memoryLinks) refs.add(l.mediaId)
  return refs
}

export async function deleteAlbum(id: number): Promise<void> {
  // 先收集媒体，删除相册后一并清理 Media 记录与存储文件（避免孤儿数据）；
  // 仍被其他相册/回忆引用的媒体只随级联解除本相册关联，不删记录与文件。
  const links = await prisma.albumMedia.findMany({
    where: { albumId: id },
    select: { mediaId: true, media: { select: { storageKey: true } } },
  })
  const mediaIds = links.map((l) => l.mediaId)
  const referenced = await mediaReferencedElsewhere(mediaIds, id)
  const deletableIds = mediaIds.filter((mid) => !referenced.has(mid))
  const storageKeys = links
    .filter((l) => !referenced.has(l.mediaId))
    .map((l) => l.media?.storageKey)
    .filter(Boolean) as string[]

  if (deletableIds.length > 0) {
    await prisma.media.deleteMany({ where: { id: { in: deletableIds } } }).catch(() => {})
  }
  await prisma.album.delete({ where: { id } })

  const storage = getStorageService()
  for (const key of storageKeys) {
    storage.delete(key).catch(() => {})
  }
}

/** 上传图片到相册：校验 + 重新编码 → 存储 → Media + AlbumMedia 记录 */
export async function addMediaToAlbum(albumId: number, files: UploadFile[], userId?: number | null): Promise<AlbumMediaItem[]> {
  if (!files || files.length === 0) throw new Error('未上传任何文件')
  if (files.length > MAX_IMAGE_COUNT) throw new Error(`单次最多上传 ${MAX_IMAGE_COUNT} 张图片`)

  const album = await prisma.album.findUnique({ where: { id: albumId } })
  if (!album) throw new Error('相册不存在')

  const storage = getStorageService()
  const created: AlbumMediaItem[] = []

  for (const file of files) {
    const safe = await validateAndSanitizeImage(file.buffer, file.mimeType)
    const ext = EXT_BY_MIME[safe.mimeType] || 'jpg'
    const key = `albums/${albumId}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
    const stored = await storage.upload(safe.buffer, key, safe.mimeType)

    const media = await prisma.media.create({
      data: {
        type: 'IMAGE',
        storageKey: key,
        mimeType: safe.mimeType,
        size: stored.size,
        width: safe.width,
        height: safe.height,
        visibility: 'SPACE',
        userId: userId ?? null,
      },
    })
    // 生成并持久化媒体变体（缩略图/预览/模糊占位）
    try {
      const variants = await generateMediaVariants(safe.buffer)
      for (const v of variants) {
        const variantKey = key.replace(/\.[a-z0-9]+$/i, '-' + v.variant.toLowerCase() + '.jpg')
        await storage.upload(v.buffer, variantKey, v.mimeType)
        await prisma.mediaVariant.create({
          data: {
            mediaId: media.id,
            variant: v.variant as any,
            storageKey: variantKey,
            width: v.width,
            height: v.height,
            size: v.size,
            mimeType: v.mimeType,
          },
        })
      }
    } catch (error) {
      console.error('[Album] 生成媒体变体失败:', error)
    }

    const maxOrder = await prisma.albumMedia.aggregate({
      where: { albumId },
      _max: { sortOrder: true },
    })
    await prisma.albumMedia.create({
      data: {
        albumId,
        mediaId: media.id,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    })

    // 未设置封面时使用第一张
    if (!album.coverMediaId) {
      await prisma.album.update({ where: { id: albumId }, data: { coverMediaId: media.id } })
    }

    created.push({
      id: media.id,
      url: mediaPublicUrl(key),
      mimeType: safe.mimeType,
      size: stored.size,
      width: safe.width,
      height: safe.height,
      createdAt: media.createdAt instanceof Date ? media.createdAt.toISOString() : String(media.createdAt),
    })
  }

  return created
}

/** 从相册移除媒体（删除关联、Media 记录与存储文件） */
export async function removeMediaFromAlbum(albumId: number, mediaId: number): Promise<void> {
  const link = await prisma.albumMedia.findUnique({
    where: { albumId_mediaId: { albumId, mediaId } },
  })
  if (!link) throw new Error('媒体不在该相册中')

  await prisma.albumMedia.delete({ where: { id: link.id } })

  // 若被删除的是封面，重新挑选
  const album = await prisma.album.findUnique({ where: { id: albumId } })
  if (album?.coverMediaId === mediaId) {
    const first = await prisma.albumMedia.findFirst({
      where: { albumId },
      orderBy: { sortOrder: 'asc' },
      select: { mediaId: true },
    })
    await prisma.album.update({
      where: { id: albumId },
      data: { coverMediaId: first?.mediaId ?? null },
    })
  }

  const media = await prisma.media.findUnique({ where: { id: mediaId } })
  if (media) {
    // 仍被其他相册或回忆引用时保留媒体与文件，只解除本相册关联
    const referenced = await mediaReferencedElsewhere([mediaId], albumId)
    if (referenced.has(mediaId)) return
    await prisma.media.delete({ where: { id: mediaId } }).catch(() => {})
    if (media.storageKey) {
      getStorageService().delete(media.storageKey).catch(() => {})
    }
  }
}

// ============================================================
// 3.6 子资源所有权校验：判断用户是否可管理该相册。
// 规则：直接归属（userId）或所属空间（spaceId）的活跃 OWNER/MEMBER。
// ============================================================
export async function canManageAlbum(albumId: number, userId: number | null | undefined): Promise<boolean> {
  if (!userId) return false
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { userId: true, spaceId: true },
  })
  if (!album) return false
  if (album.userId === userId) return true
  if (album.spaceId) {
    const member = await prisma.spaceMember.findFirst({
      where: { spaceId: album.spaceId, userId, status: 'ACTIVE', role: { in: ['OWNER', 'MEMBER'] } },
      select: { id: true },
    })
    if (member) return true
  }
  return false
}
