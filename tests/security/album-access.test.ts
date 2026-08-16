import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/album-auth', () => ({
  verifyAlbumToken: vi.fn(),
  extractAlbumToken: vi.fn(),
}))

vi.mock('@/lib/modules/album/album.service', () => ({
  listAlbums: vi.fn(),
  getAlbum: vi.fn(),
}))

import { verifyAlbumToken, extractAlbumToken } from '@/lib/album-auth'
import { listAlbums, getAlbum } from '@/lib/modules/album/album.service'
import { GET as GET_ALBUMS } from '@/app/api/albums/route'
import { GET as GET_ALBUM } from '@/app/api/albums/[id]/route'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('相册 API 服务端访问控制', () => {
  it('/api/albums 未解锁返回 403', async () => {
    ;(extractAlbumToken as any).mockReturnValue('bad-token')
    ;(verifyAlbumToken as any).mockResolvedValue(false)

    const req = new NextRequest('http://localhost/api/albums')
    const res = await GET_ALBUMS(req)
    expect(res.status).toBe(403)
    expect(listAlbums).not.toHaveBeenCalled()
  })

  it('/api/albums 已解锁返回列表', async () => {
    ;(extractAlbumToken as any).mockReturnValue('good-token')
    ;(verifyAlbumToken as any).mockResolvedValue(true)
    ;(listAlbums as any).mockResolvedValue([{ id: 1, title: 'test' }])

    const req = new NextRequest('http://localhost/api/albums')
    const res = await GET_ALBUMS(req)
    expect(res.status).toBe(200)
    expect(listAlbums).toHaveBeenCalled()
  })

  it('/api/albums/:id 未解锁返回 403', async () => {
    ;(extractAlbumToken as any).mockReturnValue(undefined)
    ;(verifyAlbumToken as any).mockResolvedValue(false)

    const req = new NextRequest('http://localhost/api/albums/1')
    const res = await GET_ALBUM(req, { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(403)
    expect(getAlbum).not.toHaveBeenCalled()
  })

  it('/api/albums/:id 已解锁返回详情', async () => {
    ;(extractAlbumToken as any).mockReturnValue('good-token')
    ;(verifyAlbumToken as any).mockResolvedValue(true)
    ;(getAlbum as any).mockResolvedValue({ id: 1, title: 'test', media: [] })

    const req = new NextRequest('http://localhost/api/albums/1')
    const res = await GET_ALBUM(req, { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(200)
    expect(getAlbum).toHaveBeenCalledWith(1)
  })
})
