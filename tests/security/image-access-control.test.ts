import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * P0-4 回归：图片归属与可见性（S-4 / S-5）。
 *
 * 覆盖评审要求的 6 条验收：
 *  ① 匿名人取 published+isPublic 图片 200；② 匿名取草稿图 404；
 *  ③ 非作者/非主人取私有图 404；④ 作者/主人 200；
 *  ⑤ upload 到他人 post 被拒；⑥ delete 他人图片被拒。
 * 关键语义：无权与不存在**同响应**（不泄露存在性）、私有图绝不再发 immutable 缓存头。
 */

const { prismaMock, requireAuthMock, siteOwnerMock } = vi.hoisted(() => ({
  prismaMock: {
    post: { findUnique: vi.fn(), findFirst: vi.fn() },
    postImage: { findUnique: vi.fn() },
  },
  requireAuthMock: vi.fn(),
  siteOwnerMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))
// 上传管线（解码/重编码）不是本用例关注点，这里直接放行，让断言只落在归属校验上
vi.mock('@/lib/infrastructure/media-validation', () => ({
  validateAndSanitizeImage: vi.fn(async (buffer: Buffer) => ({ buffer, mimeType: 'image/jpeg' })),
  MAX_IMAGE_COUNT: 10,
}))
vi.mock('@/lib/auth-middleware', () => ({ requireAuth: requireAuthMock }))
vi.mock('@/lib/site-owner', () => ({ isSiteOwner: siteOwnerMock, getSiteOwnerId: vi.fn() }))

import { ImageService, MediaAccessError } from '@/lib/services/image-service'
import { GET as getImage } from '@/app/api/images/[id]/route'

function makeImageRepo(over: Record<string, any> = {}) {
  return {
    create: vi.fn(async () => ({ id: 11 })),
    findById: vi.fn(async () => ({ id: 5, postId: 3, data: Buffer.from('x'), mimeType: 'image/jpeg', order: 0 })),
    delete: vi.fn(async () => {}),
    getMaxOrder: vi.fn(async () => -1),
    findByPostId: vi.fn(async () => []),
    ...over,
  }
}

function makePostRepo(over: Record<string, any> = {}) {
  return {
    findById: vi.fn(async () => ({ id: 3, cover: null, images: [] })),
    update: vi.fn(async () => {}),
    ...over,
  }
}

const imageFile = { name: 'a.jpg', buffer: Buffer.from('x'), mimeType: 'image/jpeg' }

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.post.findUnique.mockResolvedValue({ userId: 7 })
  siteOwnerMock.mockResolvedValue(false)
  requireAuthMock.mockResolvedValue({ authenticated: false })
})

describe('imageService.upload 归属校验（S-4）', () => {
  it('给别人的文章上传 → 拒绝且不写任何图片', async () => {
    const imgRepo = makeImageRepo()
    const postRepo = makePostRepo()
    const svc = new ImageService(imgRepo as any, postRepo as any)

    await expect(
      svc.upload(3, [imageFile], { userId: 99, isSiteOwner: false }),
    ).rejects.toBeInstanceOf(MediaAccessError)
    expect(imgRepo.create).not.toHaveBeenCalled()
  })

  it('作者本人上传 → 放行', async () => {
    const imgRepo = makeImageRepo()
    const postRepo = makePostRepo()
    const svc = new ImageService(imgRepo as any, postRepo as any)

    const r = await svc.upload(3, [imageFile], { userId: 7, isSiteOwner: false })
    expect(r.urls).toEqual(['/api/images/11'])
    expect(imgRepo.create).toHaveBeenCalledTimes(1)
  })

  it('站点主人可管理他人文章下的图片（运维/迁移场景）', async () => {
    const imgRepo = makeImageRepo()
    const postRepo = makePostRepo()
    const svc = new ImageService(imgRepo as any, postRepo as any)

    await expect(
      svc.upload(3, [imageFile], { userId: 1, isSiteOwner: true }),
    ).resolves.toBeTruthy()
    expect(imgRepo.create).toHaveBeenCalledTimes(1)
  })
})

describe('imageService.delete 归属校验（S-4）', () => {
  it('删别人的图片 → 拒绝且不真删', async () => {
    const imgRepo = makeImageRepo()
    const postRepo = makePostRepo()
    const svc = new ImageService(imgRepo as any, postRepo as any)

    await expect(
      svc.delete('/api/images/5', { userId: 99, isSiteOwner: false }),
    ).rejects.toBeInstanceOf(MediaAccessError)
    expect(imgRepo.delete).not.toHaveBeenCalled()
  })

  it('作者本人删除 → 放行', async () => {
    const imgRepo = makeImageRepo()
    const postRepo = makePostRepo()
    const svc = new ImageService(imgRepo as any, postRepo as any)

    await svc.delete('/api/images/5', { userId: 7, isSiteOwner: false })
    expect(imgRepo.delete).toHaveBeenCalledWith(5)
  })
})

function imageResponse(data = Buffer.from('img')) {
  return {
    id: 5,
    postId: 3,
    data: new Uint8Array(data),
    mimeType: 'image/jpeg',
    order: 0,
  }
}

async function callImage(id = 5) {
  return getImage(
    new NextRequest('http://localhost/api/images/' + id),
    { params: Promise.resolve({ id: String(id) }) },
  )
}

describe('GET /api/images/[id] 可见性与缓存头（S-5）', () => {
  it('匿名 + 已发布且公开 → 200，缓存 public max-age=86400', async () => {
    prismaMock.postImage.findUnique.mockResolvedValue(imageResponse())
    prismaMock.post.findUnique.mockResolvedValue({ published: true, isPublic: true, userId: 7 })

    const res = await callImage()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400')
  })

  it('匿名 + 草稿（published=false）→ 404（不能再被顺序遍历拉走）', async () => {
    prismaMock.postImage.findUnique.mockResolvedValue(imageResponse())
    prismaMock.post.findUnique.mockResolvedValue({ published: false, isPublic: true, userId: 7 })

    const res = await callImage()
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBeNull()
  })

  it('非作者 + 私密图 → 404（与不存在同响应）', async () => {
    prismaMock.postImage.findUnique.mockResolvedValue(imageResponse())
    prismaMock.post.findUnique.mockResolvedValue({ published: true, isPublic: false, userId: 7 })
    requireAuthMock.mockResolvedValue({ authenticated: true, payload: { userId: 99 } })

    const res = await callImage()
    expect(res.status).toBe(404)
  })

  it('作者本人 + 私密图 → 200，缓存 private no-store（草稿要能预览）', async () => {
    prismaMock.postImage.findUnique.mockResolvedValue(imageResponse())
    prismaMock.post.findUnique.mockResolvedValue({ published: true, isPublic: false, userId: 7 })
    requireAuthMock.mockResolvedValue({ authenticated: true, payload: { userId: 7 } })

    const res = await callImage()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('站点主人 + 他人私密图 → 200，缓存 private no-store', async () => {
    prismaMock.postImage.findUnique.mockResolvedValue(imageResponse())
    prismaMock.post.findUnique.mockResolvedValue({ published: true, isPublic: false, userId: 7 })
    requireAuthMock.mockResolvedValue({ authenticated: true, payload: { userId: 1 } })
    siteOwnerMock.mockResolvedValue(true)

    const res = await callImage()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('图片不存在 → 404', async () => {
    prismaMock.postImage.findUnique.mockResolvedValue(null)
    const res = await callImage()
    expect(res.status).toBe(404)
  })
})
