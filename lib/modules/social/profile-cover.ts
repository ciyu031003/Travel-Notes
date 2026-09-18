/**
 * 档案头图（个人主页封面）的媒体变体与焦点换算。
 *
 * 为什么单独成文件：其中 `coverObjectPosition` 是**纯函数**，前端渲染与单测都要用，
 * 而 `sharp` 相关的部分只在服务端（上传接口）用到。把纯逻辑与图像处理分开，
 * 前端 import 本文件时不会把 sharp 拖进客户端包。
 *
 * 焦点算法来自 LycheeOrg/Lychee（MIT，master 分支）
 * `resources/js/v7/components/gallery/albumModule/AlbumHeaderImage.vue`：
 *   x = (focusX * -1 + 1) * 50 ; y = (focusY * -1 + 1) * 50  →  `${x}% ${y}%`
 * 无焦点时回落 `center center`。
 *
 * 为什么要焦点：用户上传的多半是横幅风景照，直接 `object-cover` 居中有很大概率
 * 把主体（人、地标）裁掉。只存两个 float 就能让用户自己决定「画面重点在哪」。
 */

const COVER_FILE_RE = /^(https?:\/\/[^/]+)?(\/uploads\/covers\/[A-Za-z0-9_-]+)\.webp$/
const VARIANT_SUFFIX_RE = /-(preview|blur)\.(webp|jpg)$/

/**
 * 归一化焦点 → CSS `object-position`。
 *
 * 语义（有意如此，别"修"）：
 *  · 非有限数（NaN / Infinity / 字符串）→ 回落 `center`，因为无法判断用户意图；
 *  · 有限但越界（如 -3 或 5）→ **夹到 0-1 边界**，按「看最左上/最右下」处理。
 *    越界通常是客户端算格子时的小数误差，夹边界比丢掉整个焦点更符合预期。
 */
export function coverObjectPosition(
  focusX: number | null | undefined,
  focusY: number | null | undefined,
): string {
  if (!isValidFocus(focusX) || !isValidFocus(focusY)) return 'center'
  const x = (clamp01(focusX) * -1 + 1) * 50
  const y = (clamp01(focusY) * -1 + 1) * 50
  return `${round2(x)}% ${round2(y)}%`
}

function isValidFocus(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/** 头图变体 URL（-preview.webp / -blur.jpg）；非 covers 目录或已是变体则返回 null */
export function coverVariantUrl(
  url: string | null | undefined,
  variant: 'preview' | 'blur',
): string | null {
  if (!url) return null
  if (VARIANT_SUFFIX_RE.test(url)) return null
  const m = COVER_FILE_RE.exec(url)
  if (!m) return null
  const ext = variant === 'preview' ? 'webp' : 'jpg'
  return `${m[1] || ''}${m[2]}-${variant}.${ext}`
}

/** 主图/变体文件路径列表（供删除旧头图时清理），数组恒为主图在前 */
export function coverFilePaths(url: string): string[] {
  const m = COVER_FILE_RE.exec(url)
  if (!m) return []
  const base = m[2]
  return [base + '.webp', base + '-preview.webp', base + '-blur.jpg']
}

/** 头图变体尺寸：主图用于首屏、预览用于大屏、blur 做占位 */
export const COVER_SIZES = {
  main: { width: 1600, height: 900 },
  preview: { width: 400, height: 225 },
  blur: { width: 16, height: 9 },
} as const
