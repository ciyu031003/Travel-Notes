/**
 * B5：压缩模块的降级行为。
 *
 * Node 环境没有 Canvas/Image，此时**必须原样返回**而不是报错或返回空 ——
 * 上传管线的原则是"宁可传大图，不能传失败"。
 * （真实的缩放/重编码逻辑依赖浏览器 Canvas，只能真机/浏览器验证。）
 */
import { describe, it, expect } from 'vitest'
import { compressImageBase64, estimateBase64Bytes, makeThumbnailBase64 } from '@/lib/media/compress'

const SAMPLE = Buffer.alloc(64 * 1024, 3).toString('base64')

describe('B5 · 无 Canvas 环境的降级', () => {
  it('estimateBase64Bytes 与真实字节数一致', () => {
    const raw = Buffer.from('hello world')
    expect(estimateBase64Bytes(raw.toString('base64'))).toBe(raw.length)
    expect(estimateBase64Bytes('')).toBe(0)
  })

  it('compressImageBase64：无 Canvas → 原样返回且标记未压缩', async () => {
    const result = await compressImageBase64({ base64: SAMPLE, mimeType: 'image/jpeg' })
    expect(result.base64).toBe(SAMPLE)
    expect(result.compressed).toBe(false)
    expect(result.originalBytes).toBe(64 * 1024)
    expect(result.compressedBytes).toBe(64 * 1024)
  })

  it('GIF 不重编码（无论有无 Canvas）', async () => {
    const gif = Buffer.from('GIF89a').toString('base64')
    const result = await compressImageBase64({ base64: gif, mimeType: 'image/gif' })
    expect(result.base64).toBe(gif)
    expect(result.compressed).toBe(false)
    expect(result.mimeType).toBe('image/gif')
  })

  it('makeThumbnailBase64：无 Canvas → 回退原图（仍可用于写本地缩略图文件）', async () => {
    const thumb = await makeThumbnailBase64({ base64: SAMPLE })
    expect(thumb.base64).toBe(SAMPLE)
    expect(thumb.bytes).toBe(64 * 1024)
  })
})
