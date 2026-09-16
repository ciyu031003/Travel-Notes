import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { readImageDimensions } from '@/lib/exif'
import { parsePostImageUrl } from '@/lib/infrastructure/media-variants'

/**
 * 图片尺寸读取单测（Album 2.0 M1 数据缺口修复）
 *
 * 背景：存量旅行文章的图片存在 `PostImage.data` BLOB 里（不是文件、没有 Media 行），
 * 而画册排版必须知道宽高比才能决定"单页满幅 / 跨页出血"。
 * 之前这些图恒为 `width: null, height: null`，导致横图永远不会跨页出血。
 *
 * 这里用仓库里真实存在的 JPEG（public/uploads/media/*.jpg）交叉验证，
 * 而不是手工造字节——避免"测试和实现同错"。
 */

const MEDIA_DIR = path.join(process.cwd(), 'public', 'uploads', 'media')

function firstJpeg(): string | null {
  if (!fs.existsSync(MEDIA_DIR)) return null
  const f = fs.readdirSync(MEDIA_DIR).find((n) => /\.jpe?g$/i.test(n))
  return f ? path.join(MEDIA_DIR, f) : null
}

/** 构造最小 WebP 头，用于覆盖三个变体分支 */
function webp(fourcc: 'VP8X' | 'VP8 ' | 'VP8L', w: number, h: number): Buffer {
  const buf = Buffer.alloc(40)
  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(32, 4)
  buf.write('WEBP', 8, 'ascii')
  buf.write(fourcc, 12, 'ascii')
  buf.writeUInt32LE(10, 16)
  if (fourcc === 'VP8X') {
    const wm = w - 1
    const hm = h - 1
    buf[24] = wm & 0xff
    buf[25] = (wm >> 8) & 0xff
    buf[26] = (wm >> 16) & 0xff
    buf[27] = hm & 0xff
    buf[28] = (hm >> 8) & 0xff
    buf[29] = (hm >> 16) & 0xff
  } else if (fourcc === 'VP8 ') {
    buf[26] = w & 0xff
    buf[27] = (w >> 8) & 0x3f
    buf[28] = h & 0xff
    buf[29] = (h >> 8) & 0x3f
  } else {
    const packed = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14)
    buf.writeUInt32LE(packed >>> 0, 21)
  }
  return buf
}

describe('readImageDimensions · JPEG', () => {
  const file = firstJpeg()

  it('仓库真实 JPEG 的尺寸与 sharp 一致（交叉验证，不是自证）', async () => {
    if (!file) {
      // 本机没有样例图时跳过（CI 上 public/uploads 可能为空）
      expect(true).toBe(true)
      return
    }
    const buf = fs.readFileSync(file)
    const mine = readImageDimensions(buf)
    const meta = await sharp(buf).metadata()
    expect(mine).toEqual({ width: meta.width, height: meta.height })
  })

  it('只扫 SOF 即可拿到尺寸：返回值不含 EXIF 字段（与 parseExif 的职责区分）', () => {
    if (!file) return
    const dim = readImageDimensions(fs.readFileSync(file))
    expect(dim).not.toBeNull()
    expect(Object.keys(dim!).sort()).toEqual(['height', 'width'])
  })

  it('非图片字节返回 null（不抛错）', () => {
    expect(readImageDimensions(Buffer.from('not an image at all'))).toBeNull()
    expect(readImageDimensions(Buffer.alloc(0))).toBeNull()
    expect(readImageDimensions(Buffer.from([0xff, 0xd8]))).toBeNull()
  })
})

describe('readImageDimensions · WebP', () => {
  it('VP8X（含扩展头）', () => {
    expect(readImageDimensions(webp('VP8X', 1920, 1080))).toEqual({ width: 1920, height: 1080 })
  })

  it('VP8 关键帧', () => {
    expect(readImageDimensions(webp('VP8 ', 800, 600))).toEqual({ width: 800, height: 600 })
  })

  it('VP8L 无损', () => {
    expect(readImageDimensions(webp('VP8L', 512, 640))).toEqual({ width: 512, height: 640 })
  })

  it('未知 fourcc 返回 null', () => {
    const buf = webp('VP8X', 100, 100)
    buf.write('XXXX', 12, 'ascii')
    expect(readImageDimensions(buf)).toBeNull()
  })
})

describe('parsePostImageUrl', () => {
  it('识别相对与绝对形态的 /api/images/<id>', () => {
    expect(parsePostImageUrl('/api/images/42')).toBe(42)
    expect(parsePostImageUrl('/api/images/42/')).toBe(42)
    expect(parsePostImageUrl('https://travel-notes.yuanabd.cn/api/images/7')).toBe(7)
  })

  it('非该形态返回 null', () => {
    expect(parsePostImageUrl('/api/images/abc')).toBeNull()
    expect(parsePostImageUrl('/uploads/media/1.jpg')).toBeNull()
    expect(parsePostImageUrl('/api/images')).toBeNull()
    expect(parsePostImageUrl('/api/images/1/meta')).toBeNull()
    expect(parsePostImageUrl('')).toBeNull()
  })
})
