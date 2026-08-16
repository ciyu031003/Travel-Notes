import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import {
  detectImageType,
  validateAndSanitizeImage,
  validateVideoBuffer,
  MAX_IMAGE_SIZE,
  MAX_IMAGE_DIMENSION,
  MAX_VIDEO_SIZE,
} from '@/lib/infrastructure/media-validation'

async function makeJpeg(w = 8, h = 8): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .jpeg()
    .toBuffer()
}

async function makePng(w = 8, h = 8): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } } })
    .png()
    .toBuffer()
}

describe('detectImageType (Magic Number)', () => {
  it('识别 JPEG', async () => {
    const buf = await makeJpeg()
    expect(detectImageType(buf)).toBe('jpeg')
  })

  it('识别 PNG', async () => {
    const buf = await makePng()
    expect(detectImageType(buf)).toBe('png')
  })

  it('识别 WebP', async () => {
    const buf = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).webp().toBuffer()
    expect(detectImageType(buf)).toBe('webp')
  })

  it('识别 GIF（应被后续拒绝）', () => {
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0])
    expect(detectImageType(gif)).toBe('gif')
  })

  it('无法识别的字节返回 null', () => {
    expect(detectImageType(Buffer.from('hello world!!!'))).toBeNull()
    expect(detectImageType(Buffer.alloc(0))).toBeNull()
    expect(detectImageType(Buffer.alloc(8))).toBeNull()
  })
})

describe('validateAndSanitizeImage', () => {
  it('合法 JPEG 通过并返回重新编码后的图片', async () => {
    const jpeg = await makeJpeg()
    const out = await validateAndSanitizeImage(jpeg, 'image/jpeg')
    expect(out.mimeType).toBe('image/jpeg')
    expect(out.width).toBe(8)
    expect(out.height).toBe(8)
    expect(out.buffer.length).toBeGreaterThan(0)
  })

  it('空文件被拒绝', async () => {
    await expect(validateAndSanitizeImage(Buffer.alloc(0))).rejects.toThrow('文件为空')
  })

  it('超过大小限制被拒绝', async () => {
    const big = Buffer.alloc(MAX_IMAGE_SIZE + 1)
    await expect(validateAndSanitizeImage(big)).rejects.toThrow('文件大小超过限制')
  })

  it('伪造/不可识别格式被拒绝', async () => {
    await expect(validateAndSanitizeImage(Buffer.from('<?php echo 1;?>'.padEnd(64, 'x')))).rejects.toThrow('不支持或无法识别')
  })

  it('GIF 被拒绝（防存储型 XSS）', async () => {
    const gif = Buffer.alloc(64)
    gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    await expect(validateAndSanitizeImage(gif)).rejects.toThrow('不支持该图片格式')
  })

  it('客户端声明的 MIME 与真实内容不符时拒绝', async () => {
    const jpeg = await makeJpeg()
    await expect(validateAndSanitizeImage(jpeg, 'image/png')).rejects.toThrow('文件类型声明与实际内容不符')
  })

  it('超尺寸图片被拒绝', async () => {
    const huge = await makeJpeg(MAX_IMAGE_DIMENSION + 1, 1)
    await expect(validateAndSanitizeImage(huge)).rejects.toThrow('图片尺寸超过限制')
  })
})

describe('validateVideoBuffer', () => {
  it('识别 MP4 (ftyp)', () => {
    const buf = Buffer.alloc(64)
    buf.write('....ftypisom', 0, 'ascii')
    expect(validateVideoBuffer(buf)).toBe('video/mp4')
  })

  it('识别 WebM (EBML)', () => {
    const buf = Buffer.alloc(64)
    buf.set([0x1a, 0x45, 0xdf, 0xa3])
    expect(validateVideoBuffer(buf)).toBe('video/webm')
  })

  it('识别 OGG', () => {
    const buf = Buffer.alloc(64)
    buf.write('OggS', 0, 'ascii')
    expect(validateVideoBuffer(buf)).toBe('video/ogg')
  })

  it('无法识别格式被拒绝', () => {
    expect(() => validateVideoBuffer(Buffer.from('not a video at all'))).toThrow('无法识别的视频格式')
  })

  it('空文件被拒绝', () => {
    expect(() => validateVideoBuffer(Buffer.alloc(0))).toThrow('文件为空')
  })

  it('超过大小限制被拒绝', () => {
    const big = Buffer.alloc(MAX_VIDEO_SIZE + 1)
    big.write('....ftypisom', 0, 'ascii')
    expect(() => validateVideoBuffer(big)).toThrow('视频文件过大')
  })

  it('客户端声明的 MIME 与真实内容不符时拒绝', () => {
    const buf = Buffer.alloc(64)
    buf.write('....ftypisom', 0, 'ascii')
    expect(() => validateVideoBuffer(buf, 'video/webm')).toThrow('文件类型声明与实际内容不符')
  })
})
