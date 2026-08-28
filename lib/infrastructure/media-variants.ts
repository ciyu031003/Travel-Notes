/**
 * 媒体变体生成：Original / Thumbnail / Preview / Blur。
 * 用于列表缩略图、详情预览与低质量占位图，减少带宽并避免 CLS。
 */
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

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

// ------------------------------------------------------------
// 存量原始图片（Post 旅行文章封面/插图）的按需变体。
// 原始 /uploads/media/xx.jpg 常达数 MB，直接用于画册会让翻页极慢。
// 这里按需生成 -thumbnail/-preview/-blur.jpg 同目录变体，显著降带宽。
// ------------------------------------------------------------

export interface UrlPhotoVariants {
  thumbnailUrl: string
  previewUrl: string
  blurUrl: string
}

const LOCAL_URL_CACHE = new Map<string, UrlPhotoVariants>()

function uploadDir(): string {
  return process.env.UPLOAD_DIR || 'public/uploads'
}

/** 解析指向本地上传文件的 URL（/uploads/<key> 或携带域名），返回 storage key 与去后缀的 base。 */
function parseLocalUploadUrl(url: string): { key: string; base: string } | null {
  if (!url) return null
  let pathname = url
  try {
    pathname = new URL(url).pathname
  } catch {
    // 相对路径（/uploads/xx）保留原样
  }
  if (!pathname.startsWith('/uploads/')) return null
  const key = pathname.slice('/uploads/'.length)
  const ext = path.extname(key)
  if (!ext) return null
  return { key, base: key.slice(0, key.length - ext.length) }
}

/**
 * 为存量 /uploads/media/xx.jpg 原始图（Post 文章图）按需生成缩略/预览/模糊变体并写入磁盘。
 * 变体文件与原始文件同目录、以 -thumbnail/-preview/-blur 后缀命名，天然不可变，可长期缓存。
 * 对象存储模式不落地磁盘，直接返回 null（调用方回退到原图 URL）。
 */
export async function resolveLocalUrlVariants(url: string): Promise<UrlPhotoVariants | null> {
  if (!url) return null
  // 对象存储场景没有本地磁盘逻辑，交给调用方回退
  if (process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET) return null

  const cached = LOCAL_URL_CACHE.get(url)
  if (cached) return cached

  const parsed = parseLocalUploadUrl(url)
  if (!parsed) return null
  const { key, base } = parsed
  const dir = uploadDir()

  const variants = [
    { suffix: 'thumbnail', kind: 'THUMBNAIL' as MediaVariantKind },
    { suffix: 'preview', kind: 'PREVIEW' as MediaVariantKind },
    { suffix: 'blur', kind: 'BLUR' as MediaVariantKind },
  ]
  const variantPath = (suffix: string) => path.join(dir, base + '-' + suffix + '.jpg')
  const variantUrl = (suffix: string) => '/api/uploads/' + base + '-' + suffix + '.jpg'

  // 三个变体都已存在则直接返回
  let needGenerate = false
  const existing: string[] = []
  for (const { suffix } of variants) {
    if (fs.existsSync(variantPath(suffix))) existing.push(variantUrl(suffix))
    else needGenerate = true
  }
  if (!needGenerate) {
    const result: UrlPhotoVariants = { thumbnailUrl: existing[0], previewUrl: existing[1], blurUrl: existing[2] }
    LOCAL_URL_CACHE.set(url, result)
    return result
  }

  // 至少缺一个：读取原始文件并一次性重建全部变体
  const origPath = path.join(dir, key)
  const original = await fs.promises.readFile(origPath).catch(() => null)
  if (!original) return null

  const generated = await generateMediaVariants(original)
  const byKind = new Map(generated.map((g) => [g.variant, g]))
  const urls: string[] = []
  for (let i = 0; i < variants.length; i++) {
    const { suffix, kind } = variants[i]
    const g = byKind.get(kind)
    if (g) {
      const fp = variantPath(suffix)
      await fs.promises.mkdir(path.dirname(fp), { recursive: true })
      await fs.promises.writeFile(fp, g.buffer)
      urls.push(variantUrl(suffix))
    } else {
      urls.push('')
    }
  }

  // 缺变体的回退到原图
  const result: UrlPhotoVariants = {
    thumbnailUrl: urls[0] || url,
    previewUrl: urls[1] || url,
    blurUrl: urls[2] || url,
  }
  LOCAL_URL_CACHE.set(url, result)
  return result
}
