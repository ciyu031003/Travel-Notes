import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * P3-36：lib/infrastructure/media-variants.ts（328 行）此前几乎无覆盖。
 * 全部 mock sharp + fs + prisma（动态 import 的 db），不读写真实文件、不生成真实图片。
 */

const { sharpMock, fsMock, prismaMock } = vi.hoisted(() => {
  const sharpMock: any = vi.fn((_input: unknown, _opts?: unknown) => ({
    metadata: vi.fn(async () => sharpMock.__meta),
    resize: vi.fn(() => ({
      jpeg: vi.fn(() => ({ toBuffer: vi.fn(async () => Buffer.from('jpeg-bytes')) })),
    })),
  }))
  sharpMock.__meta = { width: 1000, height: 500 }
  return {
    sharpMock,
    fsMock: {
      existsSync: vi.fn(),
      promises: {
        readFile: vi.fn(),
        mkdir: vi.fn(),
        writeFile: vi.fn(),
      },
    },
    prismaMock: { postImage: { findUnique: vi.fn() } },
  }
})

vi.mock('sharp', () => ({ default: sharpMock }))
vi.mock('fs', () => ({ default: fsMock }))
vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

import {
  generateMediaVariants,
  parsePostImageUrl,
  predictLocalUrlVariants,
  resolveLocalImageDimensions,
  resolveLocalUrlVariants,
  ensureLocalUrlVariants,
} from '@/lib/infrastructure/media-variants'

/** 最小 JPEG：SOI + SOF0(宽高) + EOI，供 readImageDimensions 读取尺寸 */
function tinyJpeg(width: number, height: number): Buffer {
  const sof = Buffer.alloc(15)
  sof[0] = 8
  sof.writeUInt16BE(height, 1)
  sof.writeUInt16BE(width, 3)
  sof[5] = 3
  for (let i = 0; i < 3; i++) {
    sof[6 + i * 3] = i + 1
    sof[7 + i * 3] = 0x11
  }
  const len = Buffer.alloc(2)
  len.writeUInt16BE(sof.length + 2)
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0]), len, sof, Buffer.from([0xff, 0xd9])])
}

let urlSeq = 0
const uniqueUrl = () => '/uploads/media/test-' + ++urlSeq + '.jpg'

beforeEach(() => {
  vi.clearAllMocks()
  // 恢复 sharp 默认实现（个别用例会用 mockImplementationOnce 模拟失败）
  sharpMock.mockImplementation(() => ({
    metadata: vi.fn(async () => sharpMock.__meta),
    resize: vi.fn(() => ({
      jpeg: vi.fn(() => ({ toBuffer: vi.fn(async () => Buffer.from('jpeg-bytes')) })),
    })),
  }))
  delete process.env.STORAGE_ENDPOINT
  delete process.env.STORAGE_BUCKET
  sharpMock.__meta = { width: 1000, height: 500 }
  fsMock.existsSync.mockReturnValue(false)
  fsMock.promises.readFile.mockResolvedValue(Buffer.from('original-bytes'))
  fsMock.promises.mkdir.mockResolvedValue(undefined)
  fsMock.promises.writeFile.mockResolvedValue(undefined)
})

afterEach(() => {
  delete process.env.STORAGE_ENDPOINT
  delete process.env.STORAGE_BUCKET
})

describe('generateMediaVariants：三档变体（mock sharp）', () => {
  it('按目标宽度等比缩放：THUMBNAIL 480 / PREVIEW 1600（不放大）/ BLUR 16', async () => {
    const variants = await generateMediaVariants(Buffer.from('img'))
    expect(variants.map((v) => v.variant)).toEqual(['THUMBNAIL', 'PREVIEW', 'BLUR'])
    // 1000x500 → 480x240 / 1000x500（目标 1600 > 原宽，scale=1）/ 16x8
    expect(variants[0]).toMatchObject({ width: 480, height: 240, mimeType: 'image/jpeg' })
    expect(variants[1]).toMatchObject({ width: 1000, height: 500 })
    expect(variants[2]).toMatchObject({ width: 16, height: 8 })
    expect(variants[0].size).toBe(Buffer.from('jpeg-bytes').length)
    expect(sharpMock).toHaveBeenCalledWith(Buffer.from('img'), { failOn: 'error' })
  })

  it('metadata 缺宽高时按 1x1 兜底（不产生 0 尺寸）', async () => {
    sharpMock.__meta = {}
    const variants = await generateMediaVariants(Buffer.from('img'))
    expect(variants).toHaveLength(3)
    for (const v of variants) {
      expect(v.width).toBeGreaterThanOrEqual(1)
      expect(v.height).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('URL 解析与预测', () => {
  it('parsePostImageUrl：同源/绝对 URL 取出 id，非该形态返回 null', () => {
    expect(parsePostImageUrl('/api/images/12')).toBe(12)
    expect(parsePostImageUrl('https://example.com/api/images/7/')).toBe(7)
    expect(parsePostImageUrl('/api/images/abc')).toBeNull()
    expect(parsePostImageUrl('')).toBeNull()
    expect(parsePostImageUrl('/uploads/media/a.jpg')).toBeNull()
  })

  it('predictLocalUrlVariants：只预测不改盘；非本站 /uploads 或无扩展名返回 null', () => {
    expect(predictLocalUrlVariants('/uploads/media/a.jpg')).toEqual({
      thumbnailUrl: '/api/uploads/media/a-thumbnail.jpg',
      previewUrl: '/api/uploads/media/a-preview.jpg',
      blurUrl: '/api/uploads/media/a-blur.jpg',
    })
    expect(predictLocalUrlVariants('https://host/uploads/media/b.png')).toMatchObject({
      thumbnailUrl: '/api/uploads/media/b-thumbnail.jpg',
    })
    expect(predictLocalUrlVariants('')).toBeNull()
    expect(predictLocalUrlVariants('https://cdn.example.com/a.jpg')).toBeNull()
    expect(predictLocalUrlVariants('/uploads/media/noext')).toBeNull()
  })
})

describe('resolveLocalImageDimensions：尺寸读取与缓存', () => {
  it('空 URL / 对象存储模式 → null', async () => {
    expect(await resolveLocalImageDimensions('')).toBeNull()
    process.env.STORAGE_ENDPOINT = 'https://cos.example.com'
    process.env.STORAGE_BUCKET = 'bucket'
    expect(await resolveLocalImageDimensions('/uploads/a.jpg')).toBeNull()
  })

  it('本地图：sharp metadata 读取宽高，并命中缓存（第二次不再调 sharp）', async () => {
    const url = uniqueUrl()
    const dims = await resolveLocalImageDimensions(url)
    expect(dims).toEqual({ width: 1000, height: 500 })
    await resolveLocalImageDimensions(url)
    expect(sharpMock).toHaveBeenCalledTimes(1)
  })

  it('解析失败/非本站 URL 缓存 null，避免反复重试', async () => {
    const brokenUrl = uniqueUrl()
    sharpMock.mockImplementationOnce(() => ({
      metadata: vi.fn(async () => { throw new Error('bad image') }),
    }))
    expect(await resolveLocalImageDimensions(brokenUrl)).toBeNull()
    await resolveLocalImageDimensions(brokenUrl)
    // 失败也进缓存：第二次不会再调 sharp（只有上面 1 次）
    expect(sharpMock).toHaveBeenCalledTimes(1)

    const external = '/other/path.jpg'
    expect(await resolveLocalImageDimensions(external)).toBeNull()
    expect(await resolveLocalImageDimensions(external)).toBeNull()
  })

  it('/api/images/<id> 走 PostImage BLOB 尺寸（只查 data 列）', async () => {
    const url = '/api/images/501'
    prismaMock.postImage.findUnique.mockResolvedValue({ data: tinyJpeg(640, 480) })
    expect(await resolveLocalImageDimensions(url)).toEqual({ width: 640, height: 480 })
    expect(prismaMock.postImage.findUnique).toHaveBeenCalledWith({ where: { id: 501 }, select: { data: true } })
    // 命中缓存
    await resolveLocalImageDimensions(url)
    expect(prismaMock.postImage.findUnique).toHaveBeenCalledTimes(1)
  })

  it('BLOB 不存在 / 查库异常 → null（不抛）', async () => {
    prismaMock.postImage.findUnique.mockResolvedValueOnce(null)
    expect(await resolveLocalImageDimensions('/api/images/502')).toBeNull()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    prismaMock.postImage.findUnique.mockRejectedValueOnce(new Error('db down'))
    expect(await resolveLocalImageDimensions('/api/images/503')).toBeNull()
    spy.mockRestore()
  })
})

describe('resolveLocalUrlVariants / ensureLocalUrlVariants', () => {
  it('空 URL / 对象存储 / 非法路径 → null', async () => {
    expect(await resolveLocalUrlVariants('')).toBeNull()
    expect(await ensureLocalUrlVariants('')).toBeNull()
    process.env.STORAGE_ENDPOINT = 'https://cos.example.com'
    process.env.STORAGE_BUCKET = 'bucket'
    expect(await resolveLocalUrlVariants('/uploads/a.jpg')).toBeNull()
    expect(await ensureLocalUrlVariants('/uploads/a.jpg')).toBeNull()
    delete process.env.STORAGE_ENDPOINT
    delete process.env.STORAGE_BUCKET
    expect(await resolveLocalUrlVariants('https://cdn/a.jpg')).toBeNull()
    expect(await ensureLocalUrlVariants('/uploads/noext')).toBeNull()
  })

  it('resolveLocalUrlVariants 立即返回预测 URL，后台生成完成后缓存真实结果', async () => {
    const url = uniqueUrl()
    const predicted = await resolveLocalUrlVariants(url)
    expect(predicted?.thumbnailUrl).toContain('-thumbnail.jpg')
    // 允许后台调度跑完
    await new Promise((r) => setTimeout(r, 5))
    const again = await resolveLocalUrlVariants(url)
    expect(again).toMatchObject({ thumbnailUrl: '/api/uploads/' + url.slice('/uploads/'.length).replace(/\.jpg$/, '-thumbnail.jpg') })
  })

  it('ensureLocalUrlVariants：变体已存在 → 直接返回；缺变体 → 读原图生成并写盘', async () => {
    const url = uniqueUrl()
    fsMock.existsSync.mockReturnValue(true)
    const existing = await ensureLocalUrlVariants(url)
    expect(existing?.thumbnailUrl).toContain('-thumbnail.jpg')
    expect(fsMock.promises.writeFile).not.toHaveBeenCalled()

    const missingUrl = uniqueUrl()
    fsMock.existsSync.mockReturnValue(false)
    const generated = await ensureLocalUrlVariants(missingUrl)
    expect(generated?.thumbnailUrl).toContain('-thumbnail.jpg')
    expect(fsMock.promises.readFile).toHaveBeenCalled()
    expect(fsMock.promises.mkdir).toHaveBeenCalled()
    expect(fsMock.promises.writeFile).toHaveBeenCalledTimes(3)
  })

  it('原图不存在 → null（调用方回退原图 URL）', async () => {
    fsMock.existsSync.mockReturnValue(false)
    fsMock.promises.readFile.mockResolvedValue(null)
    const url = uniqueUrl()
    expect(await ensureLocalUrlVariants(url)).toBeNull()
  })

  it('生成失败（sharp 抛错）→ null，不把异常抛给调用方', async () => {
    fsMock.existsSync.mockReturnValue(false)
    fsMock.promises.readFile.mockResolvedValue(Buffer.from('orig'))
    sharpMock.mockImplementationOnce(() => ({
      metadata: vi.fn(async () => { throw new Error('sharp boom') }),
    }))
    const url = uniqueUrl()
    expect(await ensureLocalUrlVariants(url)).toBeNull()
  })

  it('并发 4 个不同 URL：信号量限制为 3 且全部完成', async () => {
    fsMock.existsSync.mockReturnValue(false)
    const urls = [uniqueUrl(), uniqueUrl(), uniqueUrl(), uniqueUrl()]
    const results = await Promise.all(urls.map((u) => ensureLocalUrlVariants(u)))
    expect(results.every((r) => r !== null)).toBe(true)
    expect(fsMock.promises.writeFile).toHaveBeenCalledTimes(12)
  })
})
