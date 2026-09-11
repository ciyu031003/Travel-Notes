/**
 * 头像媒体变体：上传端在保留主图（256×256 webp）的同时生成
 * -preview.webp（大头像/高分屏用）与 -blur.jpg（占位/降级用）。
 *
 * 旧头像（无变体文件）或对象存储地址不适用变体规则，返回 null，
 * 消费端据此回退到主图 URL，保证零回归。
 */

const AVATAR_FILE_RE = /^(https?:\/\/[^/]+)?(\/uploads\/avatars\/[A-Za-z0-9_-]+)\.webp$/
const VARIANT_SUFFIX_RE = /-(preview|blur)\.(webp|jpg)$/

export function avatarVariantUrl(
  url: string | null | undefined,
  variant: 'preview' | 'blur',
): string | null {
  if (!url) return null
  // 已是变体 URL 或非 avatars 目录：不重复拼后缀
  if (VARIANT_SUFFIX_RE.test(url)) return null
  const m = AVATAR_FILE_RE.exec(url)
  if (!m) return null
  const ext = variant === 'preview' ? 'webp' : 'jpg'
  return `${m[1] || ''}${m[2]}-${variant}.${ext}`
}

/** 主图/变体文件路径列表（供删除旧头像时清理），数组恒为主图在前 */
export function avatarFilePaths(url: string): string[] {
  const m = AVATAR_FILE_RE.exec(url)
  if (!m) return []
  const base = m[2]
  return [base + '.webp', base + '-preview.webp', base + '-blur.jpg']
}
