/**
 * 照片上传管线（B5：压缩 → 本地落盘（原图 + 缩略图）→ 入队 → 联网上传）。
 *
 * 与上一版的差别（都属于"用户看不见但能感受到"的修复）：
 *  ① 上传前压缩到长边 1600 / q0.82（高清模式 4096 / q0.9）：弱网下从"传 8MB"变成"传 1MB"；
 *  ② 队列 payload 不再带 thumbBase64（服务端会生成 blur 变体）：一条队列项从 ~40KB 降到 ~0.2KB；
 *  ③ 本地同时留一份 320px 缩略图；上传成功后原图由 local-files.finalize 删除、localPath 指向缩略图；
 *  ④ 超过 2MB 走分片续传（lib/media/resumable-upload），失败自动回退整图上传；
 *  ⑤ 每次添加照片顺手触发一次媒体维护（LRU 配额 400MB）。
 */
import { SyncQueue } from './sync-queue'
import { getSyncQueueStorage } from './storage'
import { isNativePlatform } from './platform'
import { writeLocalFile, readLocalFile, ensureLocalDir } from './native/filesystem'
import { getOfflineDb } from './native/sqlite-db'
import { sha256Hex } from './media'
import { apiUrl } from '@/lib/api-base'
import { compressImageBase64, makeThumbnailBase64 } from '@/lib/media/compress'
import {
  formatBytes,
  resolveCompressionPlan,
  shouldUseResumable,
  UPLOAD_MAX_EDGE,
  UPLOAD_QUALITY,
} from '@/lib/media/upload-policy'
import { runMediaMaintenance, thumbPathFor } from '@/lib/media/local-files'
import { uploadImageResumable } from '@/lib/media/resumable-upload'

export interface PickedPhoto {
  /** 本地主键（uuid） */
  id: string
  /** base64（无 data: 前缀）——已是压缩后版本 */
  base64: string
  mimeType: string
  /** 缩略图 base64（≤320px；只用于写本地缩略图文件，**不进队列 payload**） */
  thumbBase64: string
  width: number
  height: number
  /** 压缩后字节数（上传/配额统计用） */
  size: number
  /** 压缩前字节数（诊断用，可在同步中心显示节省了多少） */
  originalBytes?: number
  /** 是否已压缩过（避免 addPhotoToAlbum 二次压缩） */
  compressed?: boolean
  /** 用户是否选择了高清模式 */
  preferHd?: boolean
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
  /** 实际落盘（压缩后）字节数 */
  bytes?: number
}

function extFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }
  return map[mimeType] || 'jpg'
}

/** 媒体上传超时：与同步引擎一致（20s），避免弱网下单条请求挂死整轮 */
const MEDIA_UPLOAD_TIMEOUT_MS = 20_000

function uploadTimeoutSignal(): AbortSignal | undefined {
  const AS = typeof AbortSignal !== 'undefined'
    ? (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal })
    : undefined
  return AS && typeof AS.timeout === 'function' ? AS.timeout(MEDIA_UPLOAD_TIMEOUT_MS) : undefined
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
 * 原生端：调用 Capacitor Camera 拍照/相册选图 → 压缩到策略尺寸 → 生成缩略图。
 * @param options.preferHd 用户显式选择高清（长边 4096 / q0.9）；默认压缩
 */
export async function pickPhotoFromCamera(
  source: 'camera' | 'photos' = 'photos',
  options?: { preferHd?: boolean },
): Promise<PickedPhoto | null> {
  if (!isNativePlatform()) return null
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
    const plan = resolveCompressionPlan({ preferHd: options?.preferHd })
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Base64,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      // Camera 插件先做一次降采样（省内存），下面再用 Canvas 兜底到精确上限
      quality: Math.round(plan.quality * 100),
      width: plan.maxEdge,
      allowEditing: false,
      correctOrientation: true,
    })
    if (!photo.base64String) return null
    const rawMime = photo.format === 'png' ? 'image/png' : 'image/jpeg'
    const compressed = await compressImageBase64({
      base64: photo.base64String,
      mimeType: rawMime,
      preferHd: options?.preferHd,
    })
    const thumb = await makeThumbnailBase64({ base64: compressed.base64, mimeType: compressed.mimeType })
    const dims = compressed.width > 0 && compressed.height > 0
      ? { width: compressed.width, height: compressed.height }
      : await measureImage(compressed.base64, compressed.mimeType)
    return {
      id: crypto.randomUUID(),
      base64: compressed.base64,
      mimeType: compressed.mimeType,
      thumbBase64: thumb.base64,
      width: dims.width,
      height: dims.height,
      size: compressed.compressedBytes,
      originalBytes: compressed.originalBytes,
      compressed: true,
      preferHd: options?.preferHd === true,
    }
  } catch {
    return null
  }
}

/** 测量图片尺寸（Canvas 不可用时的兜底路径） */
function measureImage(base64: string, mimeType: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve({ width: 0, height: 0 })
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 })
    img.onerror = () => resolve({ width: 0, height: 0 })
    img.src = 'data:' + mimeType + ';base64,' + base64
  })
}

/**
 * 添加照片到相册：
 * - 原生端：写本地原图 + 本地缩略图 + media 行 + 队列项（payload 不含 thumbBase64）；
 * - Web：直接 multipart 上传（Web 没有离线队列，压缩在 pick-image 侧完成）。
 */
export async function addPhotoToAlbum(input: AddPhotoInput): Promise<AddPhotoResult> {
  if (!input.photo || !input.photo.base64) return { ok: false, error: '未选择图片' }

  if (isNativePlatform()) {
    const { photo, albumId } = input
    // 兜底压缩：调用方可能直接构造 PickedPhoto（例如从 Web 桥接过来），未压过就压一次
    const finalImage = photo.compressed
      ? { base64: photo.base64, mimeType: photo.mimeType, compressedBytes: photo.size }
      : await compressImageBase64({ base64: photo.base64, mimeType: photo.mimeType, preferHd: photo.preferHd })
    if (!finalImage.base64) return { ok: false, error: '图片处理失败' }

    const db = await getOfflineDb()
    await ensureLocalDir('media')
    const localPath = 'media/' + photo.id + '.' + extFromMime(finalImage.mimeType)
    await writeLocalFile(localPath, finalImage.base64)

    // 本地缩略图：上传成功后原图会被删掉，这份 320px 副本是"离线仍能看"的保障
    const thumbPath = thumbPathFor(photo.id)
    try {
      const thumbBase64 = photo.thumbBase64
        || (await makeThumbnailBase64({ base64: finalImage.base64, mimeType: finalImage.mimeType })).base64
      await writeLocalFile(thumbPath, thumbBase64)
    } catch {
      // 缩略图写失败不影响主流程（上传成功后 localPath 会被清空而不是指向无效文件）
    }

    /**
     * 先入队、再写 media 行（P1-24）：此刻进程被杀也只会留下"待上传项 + 文件"，
     * 同步引擎仍能把它传到云端。payload **不写 thumbBase64**（服务端生成 blur 变体）。
     */
    const queue = new SyncQueue(getSyncQueueStorage())
    await queue.enqueue({
      entityType: 'MEDIA',
      entityId: photo.id,
      remoteId: null,
      operation: 'UPLOAD_MEDIA',
      payload: { albumId, localPath, mimeType: finalImage.mimeType, size: finalImage.compressedBytes },
    })

    const hash = await sha256Hex(base64ToBytes(finalImage.base64))
    const bytes = finalImage.compressedBytes
    await db.run(
      'INSERT INTO media (id, remoteId, localPath, remoteUrl, sha256, mimeType, size, width, height, type, visibility, syncStatus, updatedAt, deleted) ' +
        'VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0) ' +
        'ON CONFLICT(id) DO UPDATE SET localPath = excluded.localPath, sha256 = excluded.sha256, syncStatus = ?, updatedAt = excluded.updatedAt',
      [
        photo.id,
        localPath,
        hash,
        finalImage.mimeType,
        bytes,
        photo.width || null,
        photo.height || null,
        'IMAGE',
        'SPACE',
        'PENDING_UPLOAD',
        Date.now(),
        'PENDING_UPLOAD',
      ],
    )

    if (!photo.compressed && photo.originalBytes && photo.originalBytes > bytes) {
      console.info('[media] 上传前压缩：' + formatBytes(photo.originalBytes) + ' → ' + formatBytes(bytes))
    }

    // 顺手做一次媒体维护（幂等：同会话只跑一次；失败静默）
    void runMediaMaintenance().catch(() => {})

    return { ok: true, local: true, bytes }
  }

  // ---- Web：在线直传（无离线队列） ----
  try {
    const image = input.photo.compressed
      ? { base64: input.photo.base64, mimeType: input.photo.mimeType, compressedBytes: input.photo.size }
      : await compressImageBase64({ base64: input.photo.base64, mimeType: input.photo.mimeType })
    const form = new FormData()
    const bytes = base64ToBytes(image.base64)
    const blob = new Blob([bytes], { type: image.mimeType })
    form.append('files', blob, 'photo-' + Date.now() + '.' + extFromMime(image.mimeType))
    const res = await fetch(apiUrl('/api/admin/albums/' + input.albumId + '/media'), {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json?.error || '上传失败' }
    return { ok: true, bytes: image.compressedBytes }
  } catch {
    return { ok: false, error: '网络错误，请重试' }
  }
}

/** 读取本地待上传照片的 base64（上传分发器用） */
export async function readLocalPhotoBase64(localPath: string): Promise<string> {
  return readLocalFile(localPath)
}

export type LocalMediaUploadOutcome =
  | { ok: true; remoteId?: number; slug?: string; via: 'resumable' | 'multipart' }
  | { ok: false; error: string; status?: number; permanent?: boolean; via: 'resumable' | 'multipart' }

/** 4xx（除 408/429）视为永久失败，交给分发器转成 SyncPermanentError */
function classifyFailure(status: number, detail: string): LocalMediaUploadOutcome {
  const message = 'HTTP ' + status + (detail ? '：' + detail : '')
  const permanent = status >= 400 && status < 500 && status !== 408 && status !== 429
  return { ok: false, error: message, status, permanent, via: 'multipart' }
}

/**
 * 把本地待上传照片传到云端相册（由 sync-dispatcher 的 UPLOAD_MEDIA 分支调用）。
 *
 * 策略：>2MB 先走分片续传（断网可续），失败**自动回退**整图 multipart ——
 * 分片是优化，不是唯一路径；优化失败不能让用户照片永远上不去。
 */
export async function uploadMediaFromLocalFile(input: {
  albumId: number | string
  localPath: string
  mimeType?: string
  /** 队列项的幂等键（payload.__clientMutationId）：重传时服务端可据此去重 */
  idempotencyKey?: string
}): Promise<LocalMediaUploadOutcome> {
  const albumId = String(input.albumId)
  const mimeType = input.mimeType || 'image/jpeg'
  const base64 = await readLocalPhotoBase64(input.localPath)
  if (!base64) return { ok: false, error: '本地照片读取失败', via: 'multipart' }

  const bytes = base64ToBytes(base64)
  if (shouldUseResumable(bytes.length)) {
    try {
      const resumable = await uploadImageResumable({
        albumId: Number(albumId),
        base64,
        mimeType,
        fileName: input.localPath.split('/').pop() || 'photo.jpg',
        // B4：把队列幂等键传给分片链路（complete 侧服务端按键去重）
        idempotencyKey: input.idempotencyKey,
      })
      if (resumable.ok) {
        const media = resumable.media
        const first = Array.isArray(media) ? (media[0] as { id?: unknown } | undefined) : undefined
        const remoteId = first && first.id != null ? Number(first.id) : undefined
        return {
          ok: true,
          remoteId: Number.isFinite(remoteId as number) ? (remoteId as number) : undefined,
          via: 'resumable',
        }
      }
      console.warn('[media] 分片上传失败，回退整图上传:', resumable.error)
    } catch (e) {
      console.warn('[media] 分片上传异常，回退整图上传:', e instanceof Error ? e.message : e)
    }
  }

  try {
    const form = new FormData()
    form.append('files', new Blob([bytes], { type: mimeType }), 'photo-' + Date.now() + '.' + extFromMime(mimeType))
    const res = await fetch(apiUrl('/api/admin/albums/' + albumId + '/media'), {
      method: 'POST',
      credentials: 'include',
      // 幂等键：弱网下"服务端已收、响应丢失"重传会生成重复照片
      headers: input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : undefined,
      body: form,
      signal: uploadTimeoutSignal(),
    })
    if (!res.ok) {
      const detail = await res
        .text()
        .then((t) => {
          try {
            const json = JSON.parse(t) as { error?: unknown }
            return typeof json.error === 'string' ? json.error.slice(0, 300) : ''
          } catch {
            return t.slice(0, 300)
          }
        })
        .catch(() => '')
      return classifyFailure(res.status, detail)
    }
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean
      error?: string
      media?: Array<{ id?: unknown }>
    }
    if (json?.success === false || json?.error) {
      return { ok: false, error: json.error || '同步未保存', via: 'multipart' }
    }
    const first = Array.isArray(json.media) ? json.media[0] : undefined
    const remoteId = first && first.id != null ? Number(first.id) : undefined
    return { ok: true, remoteId: Number.isFinite(remoteId as number) ? (remoteId as number) : undefined, via: 'multipart' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '上传失败', via: 'multipart' }
  }
}

/** 供 UI/诊断引用：当前压缩策略（避免 UI 里再写一遍魔法数字） */
export const MEDIA_UPLOAD_POLICY = {
  maxEdge: UPLOAD_MAX_EDGE,
  quality: UPLOAD_QUALITY,
  resumableThresholdBytes: 2 * 1024 * 1024,
} as const
