import { apiUrl } from '@/lib/api-base'
import {
  RESUMABLE_CHUNK_SIZE,
  isValidUploadId,
  resumeStorageKey,
} from '@/lib/infrastructure/video-upload-shared'

/**
 * 视频断点续传客户端。
 *
 * - 5MB 分片、双并发；分片文件按索引独立落盘，乱序到达也能正确拼装。
 * - 断点记忆：localStorage 存 uploadId（按 文件名+大小+mtime 指纹），刷新/重试先查
 *   status 再续传缺失分片；服务端会话过期则自动重新 init。
 * - onProgress 汇报 (百分比, 已传字节, 总字节)，粒度 = 已完成分片。
 */
export interface ResumableUploadResult {
  url: string
  filename: string
  size: number
  mimeType: string
  transcode: 'queued' | 'skipped'
}

export interface ResumableUploadOptions {
  onProgress?: (percent: number, uploadedBytes: number, totalBytes: number) => void
  signal?: AbortSignal
}

async function jsonAction(payload: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
  const res = await fetch(apiUrl('/api/admin/videos/resumable'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `请求失败(${res.status})`)
  return json
}

export async function uploadVideoResumable(
  file: File,
  opts: ResumableUploadOptions = {},
): Promise<ResumableUploadResult> {
  const { onProgress, signal } = opts
  const fingerprint = `${file.name}:${file.size}:${file.lastModified}`
  const storageKey = resumeStorageKey(fingerprint)

  // 1. 断点恢复：先试 localStorage 里的 uploadId
  let uploadId: string | null = null
  let uploaded = new Set<number>()
  let totalChunks = 0
  const savedId = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null
  if (savedId && isValidUploadId(savedId)) {
    try {
      const st = await jsonAction({ action: 'status', uploadId: savedId }, signal)
      if (st?.exists) {
        uploadId = savedId
        totalChunks = st.totalChunks
        uploaded = new Set<number>(st.uploaded || [])
      }
    } catch {
      // 会话失效，走重新 init
    }
  }

  // 2. init（无有效会话时）
  if (!uploadId) {
    const init = await jsonAction(
      { action: 'init', filename: file.name, size: file.size, mimeType: file.type || 'video/mp4' },
      signal,
    )
    uploadId = init.uploadId
    totalChunks = init.totalChunks
    uploaded = new Set()
    const newId: string = init.uploadId
    try { localStorage.setItem(storageKey, newId) } catch {}
  }
  // TS 收窄在异步闭包内失效，这里固化非空值供分片上传闭包使用
  const activeUploadId: string = uploadId as string

  const report = () => {
    const bytes = Math.min(uploaded.size * RESUMABLE_CHUNK_SIZE, file.size)
    onProgress?.(file.size === 0 ? 100 : Math.round((bytes / file.size) * 100), bytes, file.size)
  }
  report()

  // 3. 分片上传（双并发；已传分片跳过 = 断点续传）
  const pending: number[] = []
  for (let i = 0; i < totalChunks; i++) {
    if (!uploaded.has(i)) pending.push(i)
  }

  const uploadChunk = async (index: number): Promise<void> => {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const start = index * RESUMABLE_CHUNK_SIZE
    const blob = file.slice(start, Math.min(start + RESUMABLE_CHUNK_SIZE, file.size))
    const form = new FormData()
    form.append('uploadId', activeUploadId)
    form.append('index', String(index))
    form.append('chunk', blob, `${index}.part`)
    const res = await fetch(apiUrl('/api/admin/videos/resumable'), {
      method: 'POST',
      credentials: 'include',
      body: form,
      signal,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || `分片 ${index} 上传失败(${res.status})`)
    }
    uploaded.add(index)
    report()
  }

  const CONCURRENCY = 2
  let cursor = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
    while (cursor < pending.length) {
      const index = pending[cursor++]
      await uploadChunk(index)
    }
  })
  await Promise.all(workers)

  // 4. complete（拼装 + 校验 + 落盘）
  const result = await jsonAction({ action: 'complete', uploadId }, signal)
  try { localStorage.removeItem(storageKey) } catch {}
  return result as ResumableUploadResult
}

export async function abortResumableUpload(uploadId: string): Promise<void> {
  try {
    await jsonAction({ action: 'abort', uploadId })
  } catch {}
}
