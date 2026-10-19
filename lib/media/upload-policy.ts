/**
 * 媒体上传策略（B5）：压缩参数、分片阈值、文件生命周期常量。
 *
 * 为什么单独抽纯函数模块：
 *  · 这些数值是**产品/带宽决策**，散落在 UI 组件与原生桥里就再也改不动；
 *  · 纯函数可以单测（不需要 Canvas / 真机），是本轮唯一能"钉死行为"的部分。
 *
 * 参数依据：相册/回忆的展示尺寸最大约 1080px 逻辑像素（3x 屏 ≈ 3240px 物理），
 * 但私人旅行照片的价值在"能看"，不在"能印"——长边 1600 / q0.82 在 3x 屏上
 * 观看与 4K 原图的肉眼差异很小，体积通常降到 1/6~1/10。
 * 用户显式选择高清时才保留长边 4096（服务端仍会做变体与体积校验）。
 */

/** 默认压缩：长边上限（px） */
export const UPLOAD_MAX_EDGE = 1600
/** 默认压缩：JPEG 质量 */
export const UPLOAD_QUALITY = 0.82
/** 高清模式：长边上限（px） */
export const HD_MAX_EDGE = 4096
/** 高清模式：JPEG 质量 */
export const HD_QUALITY = 0.9
/** 相册缩略图长边（本地保留的低带宽副本） */
export const THUMB_MAX_EDGE = 320
/** 缩略图质量 */
export const THUMB_QUALITY = 0.82

/** 超过该体积才走分片上传（小于它的整图上传更省请求） */
export const RESUMABLE_THRESHOLD_BYTES = 2 * 1024 * 1024
/** 图片分片大小（比视频的 5MB 小：移动网络下单片失败重传成本更低） */
export const RESUMABLE_CHUNK_BYTES = 512 * 1024

export interface CompressionPlan {
  /** 长边上限 */
  maxEdge: number
  /** JPEG 质量 0–1 */
  quality: number
  /** 是否转为 JPEG（PNG 透明图在相册场景可接受丢透明；GIF 等保持原样不改） */
  toJpeg: boolean
  /** 是否用户显式要求高清（用于埋点/诊断） */
  hd: boolean
}

/** 解析本次上传的压缩参数（唯一入口，UI 只传 preferHd） */
export function resolveCompressionPlan(options?: { preferHd?: boolean; mimeType?: string }): CompressionPlan {
  const hd = options?.preferHd === true
  const mime = (options?.mimeType || '').toLowerCase()
  // GIF 压缩会丢帧（相册里动图很少），原样上传，交给服务端校验体积
  const keepAnimated = mime.includes('gif')
  return {
    maxEdge: hd ? HD_MAX_EDGE : UPLOAD_MAX_EDGE,
    quality: hd ? HD_QUALITY : UPLOAD_QUALITY,
    toJpeg: !keepAnimated,
    hd,
  }
}

/** 按长边等比缩放后的尺寸（不放大；非法输入返回 1×1 兜底） */
export function computeScaledSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number; scale: number } {
  const w = Number.isFinite(width) && width > 0 ? width : 1
  const h = Number.isFinite(height) && height > 0 ? height : 1
  const edge = Number.isFinite(maxEdge) && maxEdge > 0 ? maxEdge : Math.max(w, h)
  const scale = Math.min(1, edge / Math.max(w, h))
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  }
}

/** 是否需要缩放（长边已在上限内 → 不重编码，避免二次损失） */
export function shouldResize(width: number, height: number, maxEdge: number): boolean {
  const longest = Math.max(width || 0, height || 0)
  return longest > maxEdge
}

/** 该体积是否走分片上传 */
export function shouldUseResumable(bytes: number): boolean {
  return Number.isFinite(bytes) && bytes > RESUMABLE_THRESHOLD_BYTES
}

/** 分片总数（至少 1 片；服务端会按同一公式计算，两者必须一致） */
export function totalChunksForBytes(bytes: number, chunkBytes: number = RESUMABLE_CHUNK_BYTES): number {
  const size = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  const chunk = chunkBytes > 0 ? chunkBytes : RESUMABLE_CHUNK_BYTES
  return Math.max(1, Math.ceil(size / chunk))
}

/** 人类可读体积（诊断/日志用，避免各写一份 toFixed） */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return (i === 0 ? String(Math.round(value)) : value.toFixed(1)) + ' ' + units[i]
}
