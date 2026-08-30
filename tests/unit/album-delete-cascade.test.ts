import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 相册删除级联保护单测（Phase A3 修复回归防复发）：
 * 同一 Media 可挂多个相册（AlbumMedia @@unique）也可能被回忆引用（MemoryMedia）。
 * 仍被引用的媒体只解除当前关联，不删 Media 记录与存储文件。
 */

const { prismaMock, storageDelete } = vi.hoisted(() => ({
  prismaMock: {
    albumMedia: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    memoryMedia: {
      findMany: vi.fn(),
    },
    media: {
      deleteMany: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    album: {
      delete: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  storageDelete: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

vi.mock('@/lib/infrastructure/storage', () => ({
  getStorageService: vi.fn(() => ({ delete: storageDelete })),
}))

vi.mock('@/lib/infrastructure/media-variants', () => ({
  generateMediaVariants: vi.fn(),
}))

import {
  deleteAlbum,
  removeMediaFromAlbum,
} from '@/lib/modules/album/album.service'

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.album.delete.mockResolvedValue({})
  prismaMock.albumMedia.delete.mockResolvedValue({})
  prismaMock.media.deleteMany.mockResolvedValue({})
  prismaMock.media.delete.mockResolvedValue({})
  prismaMock.album.findUnique.mockResolvedValue(null)
  storageDelete.mockResolvedValue({})
})

describe('deleteAlbum 级联保护', () => {
  it('仍被其他相册引用的媒体：不删 Media 记录、不删存储文件', async () => {
    prismaMock.albumMedia.findMany
      .mockResolvedValueOnce([
        // deleteAlbum: 本相册的两条链接
        { mediaId: 1, media: { storageKey: 'albums/1/a.jpg' } },
        { mediaId: 2, media: { storageKey: 'albums/1/b.jpg' } },
      ])
      .mockResolvedValueOnce([
        // 引用检查：media 1 还挂在相册 2
        { mediaId: 1 },
      ])
    prismaMock.memoryMedia.findMany.mockResolvedValue([])

    await deleteAlbum(1)

    expect(prismaMock.media.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [2] } } })
    expect(storageDelete).toHaveBeenCalledTimes(1)
    expect(storageDelete).toHaveBeenCalledWith('albums/1/b.jpg')
    expect(prismaMock.album.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })

  it('被回忆引用的媒体同样保留', async () => {
    prismaMock.albumMedia.findMany
      .mockResolvedValueOnce([{ mediaId: 5, media: { storageKey: 'albums/3/c.jpg' } }])
      .mockResolvedValueOnce([])
    prismaMock.memoryMedia.findMany.mockResolvedValue([{ mediaId: 5 }])

    await deleteAlbum(3)

    expect(prismaMock.media.deleteMany).not.toHaveBeenCalled()
    expect(storageDelete).not.toHaveBeenCalled()
    expect(prismaMock.album.delete).toHaveBeenCalledWith({ where: { id: 3 } })
  })

  it('无外部引用的媒体正常删除（防孤儿数据语义保留）', async () => {
    prismaMock.albumMedia.findMany
      .mockResolvedValueOnce([
        { mediaId: 7, media: { storageKey: 'albums/4/d.jpg' } },
      ])
      .mockResolvedValueOnce([])
    prismaMock.memoryMedia.findMany.mockResolvedValue([])

    await deleteAlbum(4)

    expect(prismaMock.media.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [7] } } })
    expect(storageDelete).toHaveBeenCalledWith('albums/4/d.jpg')
  })
})

describe('removeMediaFromAlbum 级联保护', () => {
  it('仍被其他相册引用：只解除本相册关联，保留 Media 与文件', async () => {
    prismaMock.albumMedia.findUnique.mockResolvedValue({ id: 11, albumId: 1, mediaId: 9 })
    prismaMock.albumMedia.findMany
      .mockResolvedValueOnce([{ mediaId: 9 }]) // 其他相册仍引用
    prismaMock.memoryMedia.findMany.mockResolvedValue([])
    prismaMock.media.findUnique.mockResolvedValue({ id: 9, storageKey: 'albums/1/e.jpg' })

    await removeMediaFromAlbum(1, 9)

    expect(prismaMock.albumMedia.delete).toHaveBeenCalledWith({ where: { id: 11 } })
    expect(prismaMock.media.delete).not.toHaveBeenCalled()
    expect(storageDelete).not.toHaveBeenCalled()
  })

  it('无引用：删除 Media 与存储文件（原语义）', async () => {
    prismaMock.albumMedia.findUnique.mockResolvedValue({ id: 12, albumId: 1, mediaId: 10 })
    prismaMock.albumMedia.findMany
      .mockResolvedValueOnce([])
    prismaMock.memoryMedia.findMany.mockResolvedValue([])
    prismaMock.media.findUnique.mockResolvedValue({ id: 10, storageKey: 'albums/1/f.jpg' })

    await removeMediaFromAlbum(1, 10)

    expect(prismaMock.media.delete).toHaveBeenCalledWith({ where: { id: 10 } })
    expect(storageDelete).toHaveBeenCalledWith('albums/1/f.jpg')
  })

  it('媒体不在相册中时抛错', async () => {
    prismaMock.albumMedia.findUnique.mockResolvedValue(null)
    await expect(removeMediaFromAlbum(1, 99)).rejects.toThrow('媒体不在该相册中')
  })
})
