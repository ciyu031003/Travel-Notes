/**
 * 照片离线上传管线（Stage C1 · D-4 首期离线写范围补全）：
 * - 原生壳：Camera 拍照/相册选图 → 缩略（Canvas ≤320）→ 写本地 media 表 + 本地文件
 *   → SyncQueue 入队 UPLOAD_MEDIA，联网后 SyncEngine 自动 multipart 上传云端。
 * - Web：直接走在线 /api/admin/albums/[id]/media（后台已有上传，此管线仅原生端启用）。
 */
import { writeLocalEntity } from './local-write'
import { SyncQueue } from './sync-queue'
import { getSyncQueueStorage } from './storage'
import { isNativePlatform } from './platform'
import { writeLocalFile, readLocalFile, ensureLocalDir } from './native/filesystem'
import { getOfflineDb } from './native/sqlite-db'
import { sha256Hex } from './media'
import { apiUrl } from '@/lib/api-base'

export interface PickedPhoto {
  /** 本地主键（uuid） */
  id: string
  /** base64（无 data: 前缀） */
  base64: string
  mimeType: string
  /** 缩略图 base64（≤320px，上传压缩用） */
  thumbBase64: string
  width: number
  height: number
  size: number
}

export interface AddPhotoInput {
  /** 云端相册 id（需已同步/已存在） */
  albumId: number
  photo: PickedPhoto
}

export interface AddPhotoResult {
  ok: boolean
  error?: string
  /** 是否本地写入（离线，待同步） */
  local?: boolean
}

const MAX_THUMB = 320

function extFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }
  return map[mimeType] || 'jpg'
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  if (typeof atob === 'function') {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }
  return new Uint8Array(0)
}

/**
 * 原生端：调用 Capacitor Camera 拍照/相册选图，返回 base64 + 缩略图。
 * Web 端不启用（返回 null，由在线上传流程处理）。
 */
export async function pickPhotoFromCamera(source: 'camera' | 'photos' = 'photos'): Promise<PickedPhoto | null> {
  if (!isNativePlatform()) return null
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Base64,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      quality: 88,
      width: 2048,
      allowEditing: false,
      correctOrientation: true,
    })
    if (!photo.base64String) return null
    const base64 = photo.base64String
    const mimeType = photo.format === 'png' ? 'image/png' : 'image/jpeg'
    const bytes = base64ToBytes(base64)
    const dims = await measureImage(base64, mimeType)
    const thumbBase64 = await makeThumbnail(base64, mimeType, MAX_THUMB)
    return {
      id: crypto.randomUUID(),
      base64,
      mimeType,
      thumbBase64,
      width: dims.width,
      height: dims.height,
      size: bytes.length,
    }
  } catch {
    return null
  }
}

/** 测量图片尺寸（原生端 Image 元素） */
function measureImage(base64: string, mimeType: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve({ width: 0, height: 0 })
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 })
    img.onerror = () => resolve({ width: 0, height: 0 })
    img.src = `data:${mimeType};base64,${base64}`
  })
}

/** Canvas 生成缩略图（≤max，保持宽高比），返回 JPEG base64 */
function makeThumbnail(base64: string, mimeType: string, max: number): Promise<string> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined' || typeof HTMLCanvasElement === 'undefined') {
      return resolve(base64)
    }
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(base64)
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1] || base64)
      } catch {
        resolve(base64)
      }
    }
    img.onerror = () => resolve(base64)
    img.src = `data:${mimeType};base64,${base64}`
  })
}

/**
 * 添加照片到相册：
 * - 原生端：写本地 media 表（PENDING_UPLOAD）+ 本地文件 + SyncQueue 入队 UPLOAD_MEDIA，联网自动上传。
 * - Web：直接 multipart 上传（保持原行为，不经离线管线）。
 */
export async function addPhotoToAlbum(input: AddPhotoInput): Promise<AddPhotoResult> {
  if (!input.photo || !input.photo.base64) return { ok: false, error: '未选择图片' }

  if (isNativePlatform()) {
    const { photo, albumId } = input
    const db = await getOfflineDb()
    await ensureLocalDir('media')
    const localPath = `media/${photo.id}.${extFromMime(photo.mimeType)}`
    await writeLocalFile(localPath, photo.base64)

    const hash = await sha256Hex(base64ToBytes(photo.base64))
    await db.run(
      'INSERT INTO media (id, remoteId, localPath, remoteUrl, sha256, mimeType, size, width, height, type, visibility, syncStatus, updatedAt, deleted) ' +
        'VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0) ' +
        'ON CONFLICT(id) DO UPDATE SET localPath = excluded.localPath, sha256 = excluded.sha256, syncStatus = ?, updatedAt = excluded.updatedAt',
      [photo.id, localPath, hash, photo.mimeType, photo.size, photo.width || null, photo.height || null, 'IMAGE', 'COUPLE', 'PENDING_UPLOAD', Date.now(), 'PENDING_UPLOAD'],
    )

    const queue = new SyncQueue(getSyncQueueStorage())
    await queue.enqueue({
      entityType: 'MEDIA',
      entityId: photo.id,
      remoteId: null,
      operation: 'UPLOAD_MEDIA',
      payload: JSON.stringify({ albumId, localPath, mimeType: photo.mimeType, thumbBase64: photo.thumbBase64 }),
    })
    return { ok: true, local: true }
  }

  try {
    const form = new FormData()
    const bytes = base64ToBytes(input.photo.base64)
    const blob = new Blob([bytes], { type: input.photo.mimeType })
    form.append('files', blob, `photo-${Date.now()}.${extFromMime(input.photo.mimeType)}`)
    const res = await fetch(apiUrl(`/api/admin/albums/${input.albumId}/media`), {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json?.error || '上传失败' }
    return { ok: true }
  } catch {
    return { ok: false, error: '网络错误，请重试' }
  }
}

/** 读取本地待上传照片的 base64（上传分发器用） */
export async function readLocalPhotoBase64(localPath: string): Promise<string> {
  return readLocalFile(localPath)
}
