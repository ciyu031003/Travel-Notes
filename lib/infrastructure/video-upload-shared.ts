/**
 * 视频断点续传共享常量与纯函数（服务端 route / 客户端 uploader / 测试共用）。
 * 不含 Node API，保持同构。
 */

/** 分片大小：5MB —— 远小于 Nginx client_max_body_size(100m)，弱网下单片重试代价低 */
export const RESUMABLE_CHUNK_SIZE = 5 * 1024 * 1024

/** 断点会话元数据有效期：超过后 init 时清理临时目录 */
export const RESUMABLE_SESSION_TTL_MS = 24 * 60 * 60 * 1000

/** uploadId 只允许 UUID 形态，杜绝路径穿越（../、绝对路径、编码绕过都进不来） */
export function isValidUploadId(uploadId: unknown): uploadId is string {
  return typeof uploadId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uploadId)
}

/** 分片数（向上取整） */
export function totalChunksFor(size: number, chunkSize = RESUMABLE_CHUNK_SIZE): number {
  return Math.max(1, Math.ceil(size / chunkSize))
}

/**
 * 转码产物命名：`abc.mp4` → `abc-720.mp4`（同目录）。
 * 支持多扩展名来源（webm/ogg 也统一出 mp4 变体，方便浏览器一致性播放）。
 */
export function variantFilenameFor(filename: string): string {
  const dot = filename.lastIndexOf('.')
  const base = dot > 0 ? filename.slice(0, dot) : filename
  return `${base}-720.mp4`
}

/** 转码触发阈值：小于此值的视频不转码（收益低） */
export const TRANSCODE_MIN_SIZE = 20 * 1024 * 1024

/** 客户端断点记忆的 localStorage key（按文件指纹区分） */
export function resumeStorageKey(fingerprint: string): string {
  return `tn-vupload:${fingerprint}`
}
