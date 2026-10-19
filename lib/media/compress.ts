/**
 * 图片压缩（B5）：上传前把照片压到策略允许的尺寸/质量。
 *
 * 为什么在客户端压而不是只靠服务端：
 *  · 移动网络上"传 8MB 再在服务端缩到 1600"要付 8MB 的上行流量与等待；
 *  · 离线队列尤其敏感：弱网下大图永远传不完，用户以为照片丢了自己却不知道。
 *
 * 实现说明：
 *  · 浏览器/WebView 用 Canvas（Android WebView 支持）；没有 Canvas 的环境原样返回；
 *  · 只在需要时重编码（长边已在上限内 → 不碰，避免二次损失）；
 *  · 一律输出 JPEG（q 由策略给），透明 PNG 在相册里丢透明是可接受的取舍。
 *  · 本文件被 Web（pick-image）与原生壳（media-upload）共用，不依赖 Capacitor。
 */
import {
  resolveCompressionPlan,
  computeScaledSize,
  shouldResize,
  THUMB_MAX_EDGE,
  THUMB_QUALITY,
  type CompressionPlan,
} from './upload-policy'

export interface CompressedImage {
  /** 不含 data: 前缀 */
  base64: string
  mimeType: string
  width: number
  height: number
  /** 压缩后字节数 */
  compressedBytes: number
  /** 压缩前字节数 */
  originalBytes: number
  /** 是否真的重编码过 */
  compressed: boolean
}

function base64LengthToBytes(base64: string): number {
  if (!base64) return 0
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

function hasCanvas(): boolean {
  return typeof document !== 'undefined' && typeof Image !== 'undefined' && typeof HTMLCanvasElement !== 'undefined'
}

function loadImage(base64: string, mimeType: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve(null)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = 'data:' + (mimeType || 'image/jpeg') + ';base64,' + base64
  })
}

/** 用 Canvas 重绘并导出 JPEG base64（失败返回 null，由调用方回退原图） */
async function redrawToJpeg(
  base64: string,
  mimeType: string,
  targetWidth: number,
  targetHeight: number,
  quality: number,
): Promise<string | null> {
  if (!hasCanvas()) return null
  const img = await loadImage(base64, mimeType)
  if (!img) return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const comma = dataUrl.indexOf(',')
    return comma >= 0 ? dataUrl.slice(comma + 1) : null
  } catch {
    return null
  }
}

/**
 * 压缩一张照片（base64 → base64）。
 * 任何一步不可用时**原样返回**（宁可传大图，不能传失败）。
 */
export async function compressImageBase64(input: {
  base64: string
  mimeType?: string
  preferHd?: boolean
}): Promise<CompressedImage> {
  const mimeType = input.mimeType || 'image/jpeg'
  const originalBytes = base64LengthToBytes(input.base64)
  const plan: CompressionPlan = resolveCompressionPlan({ preferHd: input.preferHd, mimeType })

  // 动图/不需要动的情况：原样返回
  if (!plan.toJpeg) {
    return { base64: input.base64, mimeType, width: 0, height: 0, compressedBytes: originalBytes, originalBytes, compressed: false }
  }

  const img = hasCanvas() ? await loadImage(input.base64, mimeType) : null
  if (!img) {
    return { base64: input.base64, mimeType, width: 0, height: 0, compressedBytes: originalBytes, originalBytes, compressed: false }
  }

  const srcW = img.naturalWidth || 0
  const srcH = img.naturalHeight || 0
  const needResize = shouldResize(srcW, srcH, plan.maxEdge)
  const target = computeScaledSize(srcW, srcH, plan.maxEdge)
  const outBase64 = await redrawToJpeg(input.base64, mimeType, target.width, target.height, plan.quality)
  if (!outBase64) {
    return { base64: input.base64, mimeType, width: srcW, height: srcH, compressedBytes: originalBytes, originalBytes, compressed: false }
  }
  const compressedBytes = base64LengthToBytes(outBase64)
  return {
    base64: outBase64,
    mimeType: 'image/jpeg',
    width: target.width,
    height: target.height,
    compressedBytes,
    originalBytes,
    compressed: needResize || compressedBytes < originalBytes,
  }
}

/** 生成相册缩略图（长边 320 / q0.82），用于上传成功后本地保留的低带宽副本 */
export async function makeThumbnailBase64(input: {
  base64: string
  mimeType?: string
}): Promise<{ base64: string; width: number; height: number; bytes: number }> {
  const mimeType = input.mimeType || 'image/jpeg'
  const img = hasCanvas() ? await loadImage(input.base64, mimeType) : null
  if (!img) {
    return { base64: input.base64, width: 0, height: 0, bytes: base64LengthToBytes(input.base64) }
  }
  const srcW = img.naturalWidth || 1
  const srcH = img.naturalHeight || 1
  const target = computeScaledSize(srcW, srcH, THUMB_MAX_EDGE)
  const out = await redrawToJpeg(input.base64, mimeType, target.width, target.height, THUMB_QUALITY)
  if (!out) {
    return { base64: input.base64, width: srcW, height: srcH, bytes: base64LengthToBytes(input.base64) }
  }
  return { base64: out, width: target.width, height: target.height, bytes: base64LengthToBytes(out) }
}

/** 测试/诊断用：base64 体积估算（避免在测试里造几 MB 字符串） */
export function estimateBase64Bytes(base64: string): number {
  return base64LengthToBytes(base64)
}
