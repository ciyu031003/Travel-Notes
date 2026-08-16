/**
 * 媒体变体生成：Original / Thumbnail / Preview / Blur。
 * 用于列表缩略图、详情预览与低质量占位图，减少带宽并避免 CLS。
 */
import sharp from 'sharp'

export type MediaVariantKind = 'THUMBNAIL' | 'PREVIEW' | 'BLUR'

export interface GeneratedVariant {
  variant: MediaVariantKind
  buffer: Buffer
  width: number
  height: number
  size: number
  mimeType: string
}

const THUMBNAIL_WIDTH = 480
const PREVIEW_WIDTH = 1600
const BLUR_WIDTH = 16

export async function generateMediaVariants(input: Buffer): Promise<GeneratedVariant[]> {
  const image = sharp(input, { failOn: 'error' })
  const meta = await image.metadata()

  const width = meta.width || 1
  const height = meta.height || 1

  async function resize(target: number): Promise<{ buffer: Buffer; width: number; height: number }> {
    const scale = Math.min(1, target / width)
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    const buffer = await sharp(input, { failOn: 'error' })
      .resize({ width: w, height: h, fit: 'inside' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()
    return { buffer, width: w, height: h }
  }

  const [thumb, preview, blur] = await Promise.all([
    resize(THUMBNAIL_WIDTH),
    resize(PREVIEW_WIDTH),
    resize(BLUR_WIDTH),
  ])

  return [
    { variant: 'THUMBNAIL', buffer: thumb.buffer, width: thumb.width, height: thumb.height, size: thumb.buffer.length, mimeType: 'image/jpeg' },
    { variant: 'PREVIEW', buffer: preview.buffer, width: preview.width, height: preview.height, size: preview.buffer.length, mimeType: 'image/jpeg' },
    { variant: 'BLUR', buffer: blur.buffer, width: blur.width, height: blur.height, size: blur.buffer.length, mimeType: 'image/jpeg' },
  ]
}
