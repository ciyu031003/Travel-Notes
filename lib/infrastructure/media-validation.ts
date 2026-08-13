/**
 * 媒体上传安全校验：
 * - 不信任客户端 MIME，使用 Magic Number 检测真实类型
 * - 仅允许 JPEG / PNG / WebP（默认禁止 SVG，防止存储型 XSS）
 * - 使用 sharp 重新编码，剥离 EXIF/GPS 等危险或隐私元数据
 * - 限制文件大小、尺寸与单次数量
 */
import sharp, { type Sharp } from 'sharp'

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
export const MAX_IMAGE_DIMENSION = 8000 // 宽或高最大 8000px
export const MAX_IMAGE_COUNT = 20 // 单次请求最多文件数

export const MAX_VIDEO_SIZE = 500 * 1024 * 1024 // 500MB
export const MAX_VIDEO_COUNT = 5

export type DetectedImageType = 'jpeg' | 'png' | 'webp' | 'gif' | null

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/** 通过 Magic Number 检测图片真实类型 */
export function detectImageType(buffer: Buffer): DetectedImageType {
  if (!buffer || buffer.length < 12) return null

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg'

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e &&
    buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a &&
    buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return 'png'

  // WebP: RIFF .... WEBP
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'webp'

  // GIF: 47 49 46 38 (GIF8)
  if (
    buffer[0] === 0x47 && buffer[1] === 0x49 &&
    buffer[2] === 0x46 && buffer[3] === 0x38
  ) return 'gif'

  return null
}

function detectVideoType(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) return null
  // MP4 / MOV: ftyp box at offset 4
  if (buffer.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4'
  // WebM / Matroska: EBML header 1A 45 DF A3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return 'video/webm'
  // OGG: OggS
  if (buffer.toString('ascii', 0, 4) === 'OggS') return 'video/ogg'
  return null
}

export interface ValidatedImage {
  buffer: Buffer
  mimeType: string
  width: number
  height: number
}

/**
 * 校验并安全化图片：
 * 1. Magic Number 校验（拒绝伪造/误报类型）
 * 2. 尺寸与大小限制
 * 3. sharp 解码并重新编码（剥离 EXIF/GPS 元数据，杜绝 polyglot）
 */
export async function validateAndSanitizeImage(
  input: Buffer,
  declaredMimeType?: string,
): Promise<ValidatedImage> {
  if (!input || input.length === 0) {
    throw new Error('文件为空')
  }
  if (input.length > MAX_IMAGE_SIZE) {
    throw new Error(`文件大小超过限制（最大 ${Math.round(MAX_IMAGE_SIZE / 1024 / 1024)}MB）`)
  }

  const detected = detectImageType(input)
  if (!detected) {
    throw new Error('不支持或无法识别的图片格式（仅支持 JPEG/PNG/WebP）')
  }
  if (detected === 'gif' || detected === 'svg' as any) {
    throw new Error('不支持该图片格式（仅支持 JPEG/PNG/WebP）')
  }

  // 若声明了 MIME，校验与 Magic Number 一致；不一致时以 Magic Number 为准（不信任客户端）
  const expectedMime = MIME_TO_EXT[declaredMimeType || ''] || EXT_TO_MIME[detected]
  const actualMime = EXT_TO_MIME[detected]
  if (expectedMime && expectedMime !== actualMime) {
    // 客户端声明与实际不符：拒绝而非静默转换，避免混淆攻击面
    throw new Error('文件类型声明与实际内容不符')
  }

  let image: Sharp
  try {
    image = sharp(input, { failOn: 'error' })
    const metadata = await image.metadata()
    if (!metadata.width || !metadata.height) {
      throw new Error('无法解析图片尺寸')
    }
    if (
      metadata.width > MAX_IMAGE_DIMENSION ||
      metadata.height > MAX_IMAGE_DIMENSION
    ) {
      throw new Error(`图片尺寸超过限制（最大 ${MAX_IMAGE_DIMENSION}px）`)
    }

    // 重新编码：默认剥离全部元数据（EXIF/GPS）
    let output: Buffer
    let mimeType: string
    switch (detected) {
      case 'jpeg':
        output = await image.jpeg({ quality: 88, mozjpeg: true }).toBuffer()
        mimeType = 'image/jpeg'
        break
      case 'png':
        output = await image.png({ compressionLevel: 8 }).toBuffer()
        mimeType = 'image/png'
        break
      case 'webp':
        output = await image.webp({ quality: 88 }).toBuffer()
        mimeType = 'image/webp'
        break
      default:
        throw new Error('不支持或无法识别的图片格式（仅支持 JPEG/PNG/WebP）')
    }

    const outMeta = await sharp(output).metadata()
    return {
      buffer: output,
      mimeType,
      width: outMeta.width || metadata.width,
      height: outMeta.height || metadata.height,
    }
  } catch (err: any) {
    if (err?.message?.includes('无法解析图片尺寸') || err?.message?.startsWith('图片尺寸')) {
      throw err
    }
    throw new Error('图片解码失败或文件已损坏')
  }
}

/** 校验视频文件（Magic Number + 大小限制），返回真实 MIME */
export function validateVideoBuffer(input: Buffer, declaredMimeType?: string): string {
  if (!input || input.length === 0) {
    throw new Error('文件为空')
  }
  if (input.length > MAX_VIDEO_SIZE) {
    throw new Error(`视频文件过大（最大 ${Math.round(MAX_VIDEO_SIZE / 1024 / 1024)}MB）`)
  }

  const detected = detectVideoType(input)
  if (!detected) {
    throw new Error('无法识别的视频格式（仅支持 MP4/WebM）')
  }
  if (declaredMimeType && declaredMimeType !== detected) {
    throw new Error('文件类型声明与实际内容不符')
  }
  return detected
}
