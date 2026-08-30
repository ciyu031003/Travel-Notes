import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// 相册数据接口已收敛为单数 /api/album（原复数 /api/albums 路由已删除），
// 访问控制测试随之重定向到现役路由。

vi.mock('@/lib/album-auth', () => ({
  verifyAlbumToken: vi.fn(),
  extractAlbumToken: vi.fn(),
  ALBUM_COOKIE: 'album_token',
}))

vi.mock('@/lib/modules/album/album.service', () => ({
  listAlbums: vi.fn(),
}))

vi.mock('@/lib/container', () => ({
  getPostService: vi.fn(() => ({ getPostsHybrid: vi.fn(async () => []) })),
}))

vi.mock('@/lib/current-user', () => ({
  getCurrentUserId: vi.fn(async () => 1),
}))

vi.mock('@/lib/province-map', () => ({
  findProvinceByLocation: vi.fn(() => undefined),
}))

import { verifyAlbumToken } from '@/lib/album-auth'
import { listAlbums } from '@/lib/modules/album/album.service'
import { GET as GET_ALBUM } from '@/app/api/album/route'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('相册 API 服务端访问控制', () => {
  it('/api/album 未解锁返回 403', async () => {
    ;(verifyAlbumToken as any).mockResolvedValue(false)

    const req = new NextRequest('http://localhost/api/album', {
      headers: { cookie: 'album_token=bad-token' },
    })
    const res = await GET_ALBUM(req)
    expect(res.status).toBe(403)
    expect(listAlbums).not.toHaveBeenCalled()
  })

  it('/api/album 已解锁返回列表', async () => {
    ;(verifyAlbumToken as any).mockResolvedValue(true)
    ;(listAlbums as any).mockResolvedValue([{ id: 1, title: 'test' }])

    const req = new NextRequest('http://localhost/api/album', {
      headers: { cookie: 'album_token=good-token' },
    })
    const res = await GET_ALBUM(req)
    expect(res.status).toBe(200)
    expect(listAlbums).toHaveBeenCalled()
  })

  it('/api/album 未带 cookie 视为未解锁返回 403', async () => {
    ;(verifyAlbumToken as any).mockResolvedValue(false)

    const req = new NextRequest('http://localhost/api/album')
    const res = await GET_ALBUM(req)
    expect(res.status).toBe(403)
    expect(listAlbums).not.toHaveBeenCalled()
  })
})
