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
const IN_FLIGHT = new Map<string, Promise<UrlPhotoVariants | null>>()

// 并发上限：避免首访一次性对几十张原图做 sharp 处理、占满 CPU。
const CONCURRENCY = 3
let running = 0
const queue: Array<() => void> = []

async function runLimited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= CONCURRENCY) {
    await new Promise<void>((resolve) => queue.push(resolve))
  }
  running++
  try {
    return await fn()
  } finally {
    running--
    const next = queue.shift()
    if (next) next()
  }
}

/** 并发去重：同一 URL 的生成任务只起一个，后续调用共享其结果。 */
function scheduleLocalVariants(url: string): Promise<UrlPhotoVariants | null> {
  const existing = IN_FLIGHT.get(url)
  if (existing) return existing
  const p = runLimited(() => buildLocalVariants(url))
    .catch(() => null)
    .finally(() => IN_FLIGHT.delete(url))
  IN_FLIGHT.set(url, p)
  return p
}

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

const VARIANTS: { suffix: string; kind: MediaVariantKind }[] = [
  { suffix: 'thumbnail', kind: 'THUMBNAIL' },
  { suffix: 'preview', kind: 'PREVIEW' },
  { suffix: 'blur', kind: 'BLUR' },
]

function variantPathFor(dir: string, base: string, suffix: string): string {
  return path.join(dir, base + '-' + suffix + '.jpg')
}

function variantUrlFor(base: string, suffix: string): string {
  return '/api/uploads/' + base + '-' + suffix + '.jpg'
}

/**
 * 仅计算某原图 URL 的三个变体 URL（不触磁盘、不生成）。
 * 用于 API 关键路径立即返回，变体由后台调度或运行时路由按需生成，避免首访阻塞。
 */
export function predictLocalUrlVariants(url: string): UrlPhotoVariants | null {
  if (!url) return null
  const parsed = parseLocalUploadUrl(url)
  if (!parsed) return null
  const { base } = parsed
  return {
    thumbnailUrl: variantUrlFor(base, 'thumbnail'),
    previewUrl: variantUrlFor(base, 'preview'),
    blurUrl: variantUrlFor(base, 'blur'),
  }
}

/**
 * 真实生成变体（并发信号量保护）。产物写磁盘（-thumbnail/-preview/-blur.jpg 同目录）。
 * 原图不存在返回 null（调用方回退到原图 URL）。
 */
async function buildLocalVariants(url: string): Promise<UrlPhotoVariants | null> {
  const parsed = parseLocalUploadUrl(url)
  if (!parsed) return null
  const { key, base } = parsed
  const dir = uploadDir()

  const variantPath = (suffix: string) => variantPathFor(dir, base, suffix)
  const variantUrl = (suffix: string) => variantUrlFor(base, suffix)

  // 三个变体都已存在则直接返回
  let needGenerate = false
  const existing: string[] = []
  for (const { suffix } of VARIANTS) {
    if (fs.existsSync(variantPath(suffix))) existing.push(variantUrl(suffix))
    else needGenerate = true
  }
  if (!needGenerate) {
    return { thumbnailUrl: existing[0], previewUrl: existing[1], blurUrl: existing[2] }
  }

  // 至少缺一个：读取原始文件并一次性重建全部变体
  const origPath = path.join(dir, key)
  const original = await fs.promises.readFile(origPath).catch(() => null)
  if (!original) return null

  const generated = await generateMediaVariants(original)
  const byKind = new Map(generated.map((g) => [g.variant, g]))
  const urls: string[] = []
  for (let i = 0; i < VARIANTS.length; i++) {
    const { suffix, kind } = VARIANTS[i]
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

  return {
    thumbnailUrl: urls[0] || url,
    previewUrl: urls[1] || url,
    blurUrl: urls[2] || url,
  }
}

/**
 * 解析/生成存量 /uploads/media/xx.jpg 原始图（Post 文章图）的缩略/预览/模糊变体。
 * 立即返回该图三个预测变体 URL（不阻塞），并把实际生成调度到后台并发队列（同 URL 去重、并发上限 3）。
 * 调用方拿到 URL 即可渲染；变体文件由后台调度或 GET /api/uploads/... 命中时按需生成。
 * 对象存储模式不落地磁盘，返回 null（调用方回退到原图 URL）。
 */
export async function resolveLocalUrlVariants(url: string): Promise<UrlPhotoVariants | null> {
  if (!url) return null
  // 对象存储场景没有本地磁盘逻辑，交给调用方回退
  if (process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET) return null

  const predict = predictLocalUrlVariants(url)
  if (!predict) return null

  // 命中缓存（已生成过）直接返回，否则用预测 URL 立即返回并后台调度生成
  const cached = LOCAL_URL_CACHE.get(url)
  if (cached) {
    if (cached.previewUrl !== predict.previewUrl) LOCAL_URL_CACHE.set(url, predict)
    return cached
  }

  LOCAL_URL_CACHE.set(url, predict)
  // 后台生成（去重 + 并发上限）；失败则回退为原图 URL
  scheduleLocalVariants(url).then((result) => {
    if (result) LOCAL_URL_CACHE.set(url, result)
  })
  return predict
}

/**
 * 确保某原图 URL 的变体已生成（等待后台调度完成，含去重与并发信号量）。
 * 供运行时路由在命中不存在的变体文件时按需兜底生成后再服务。
 */
export async function ensureLocalUrlVariants(url: string): Promise<UrlPhotoVariants | null> {
  if (!url) return null
  if (process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET) return null
  const cached = LOCAL_URL_CACHE.get(url)
  if (cached) return cached
  const parsed = parseLocalUploadUrl(url)
  if (!parsed) return null
  const result = await scheduleLocalVariants(url)
  if (result) LOCAL_URL_CACHE.set(url, result)
  return result
}
