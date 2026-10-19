'use client'

/**
 * 选照片（Web + 原生统一入口）。
 *
 * 为什么需要：现有 `pickPhotoFromCamera` 只在原生壳里可用（Capacitor Camera），
 * 而"给回忆传照片"这件事在 Web 端同样要做。这里补齐 Web 的 file input 路径，
 * 并把两端归一成同一个 `PickedPhoto` 形状（base64 + 元数据）。
 */
import { pickPhotoFromCamera } from '@/lib/modules/offline/media-upload'
import { compressImageBase64 } from '@/lib/media/compress'

export interface PickedImage {
  /** 本地唯一 id（原生壳直接用 Capacitor 的；Web 用随机 id） */
  id: string
  /** 不含 data: 前缀的 base64（已压缩） */
  base64: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  /** 压缩前字节数（诊断/展示"节省了多少"） */
  originalBytes?: number
}

/**
 * Web：读 file input 选中的文件并**真正压缩**（长边 1600 / q0.82，高清模式 4096 / q0.9）。
 *
 * 上一版注释写着"压到合理尺寸"但实现只读了原始 base64 —— 于是 Web 端每次都在传
 * 好几 MB 的原图。B5 起统一走 lib/media/compress（与原生壳同一套策略）。
 */
async function readFileAsImage(file: File, options?: { preferHd?: boolean }): Promise<PickedImage | null> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = () => reject(new Error('读取失败'))
    fr.readAsDataURL(file)
  })
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return null
  const base64 = dataUrl.slice(comma + 1)

  // 取原始尺寸（用于画册版式与占位）
  const dims = await new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve({ w: 0, h: 0 })
    img.src = dataUrl
  })

  const compressed = await compressImageBase64({
    base64,
    mimeType: file.type || 'image/jpeg',
    preferHd: options?.preferHd,
  })

  return {
    id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    base64: compressed.base64,
    mimeType: compressed.mimeType,
    size: compressed.compressedBytes,
    width: compressed.width || dims.w || null,
    height: compressed.height || dims.h || null,
    originalBytes: compressed.originalBytes || file.size,
  }
}

/**
 * 打开选择器并返回一张照片（两端都已完成压缩）。
 * @param prefer    来源偏好；Web 端忽略该参数（统一走文件选择）
 * @param options.preferHd 用户显式选择高清（默认压缩到长边 1600）
 */
export async function pickImage(
  prefer: 'photos' | 'camera' = 'photos',
  options?: { preferHd?: boolean },
): Promise<PickedImage | null> {
  const { isNativePlatform } = await import('@/lib/modules/offline/platform')
  if (isNativePlatform()) {
    const p = await pickPhotoFromCamera(prefer as 'camera' | 'photos', options)
    if (!p) return null
    return {
      id: p.id,
      base64: p.base64,
      mimeType: p.mimeType,
      size: p.size,
      width: p.width ?? null,
      height: p.height ?? null,
      originalBytes: p.originalBytes,
    }
  }

  return new Promise<PickedImage | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (prefer === 'camera') input.capture = 'environment'
    input.style.display = 'none'
    input.onchange = async () => {
      const file = input.files?.[0]
      input.remove()
      if (!file) return resolve(null)
      try {
        resolve(await readFileAsImage(file, options))
      } catch {
        resolve(null)
      }
    }
    // 用户取消时不会触发 change；挂到 body 以便移动端 Safari 正常唤起
    document.body.appendChild(input)
    input.click()
  })
}

/** base64 → Uint8Array（上传用） */
export function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  if (mime.includes('heic')) return 'heic'
  return 'jpg'
}
