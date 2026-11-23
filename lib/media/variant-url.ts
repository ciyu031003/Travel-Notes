/**
 * 媒体变体 URL 推导（移动端性能专项 E3）。
 *
 * 现状（2026-11）：批量导入的照片原图单张 8–10MB（public/uploads/media/*.jpg），
 * 列表/照片墙此前直接渲染原图 —— 0.8Mbps 弱网下单张就要 80s+，首屏因此卡死。
 * 服务端早已有三级变体约定与按需生成路由：
 *   · 生成：lib/infrastructure/media-variants.ts（THUMBNAIL 480px / PREVIEW 1600px / BLUR 16px，均输出 jpg）
 *   · 服务：app/api/uploads/[...path]/route.ts（命中不到变体文件时**按需生成**后再返回，
 *     并带 immutable 缓存头）；静态 /uploads/<base>-thumbnail.jpg 只有文件已存在时才有。
 *
 * 为什么客户端也要有这套推导：多数接口下发的仍是原图 URL（列表卡片、照片墙、旅程封面），
 * 逐个改造接口属于服务端写域，本轮先在渲染层把「原图 URL → 变体 URL」收敛成一个纯函数，
 * 组件只负责"优先变体、失败逐级回退原图"。
 *
 * 推导规则（幂等、可安全重复调用）：
 *   1. 空值 / 非本站资源（CDN、unsplash、blob:、data:）→ 原样返回，绝不改写；
 *   2. 已经是变体（*-thumbnail.jpg / *-preview.jpg / *-blur.jpg）→ 原样返回；
 *   3. 无扩展名 / 非图片扩展名（含 gif、avif：动图与 AVIF 变体收益低且会丢帧）→ 原样返回；
 *   4. /uploads/covers、/uploads/avatars：上传时已有专用变体（-preview.webp / -blur.jpg）
 *      且主图本身只有 2.6KB，不再派生（避免生成重复的 jpg 变体）；
 *   5. 其余本站 /uploads/** 图片：把路径前缀换成按需生成路由
 *      /uploads/media/a.jpg → /api/uploads/media/a-thumbnail.jpg（同源、保留绝对地址的 origin）。
 *
 * 保持纯函数、零依赖：可在客户端组件、服务端、单测里共用（与 profile-cover / avatar-variants 同思路）。
 */

/** 变体种类，与 lib/infrastructure/media-variants.ts 的 MediaVariantKind 一一对应 */
export type MediaVariant = 'thumbnail' | 'preview' | 'blur'

/** 服务端三个变体一律输出 jpg（见 generateMediaVariants），与原始扩展名无关 */
const VARIANT_EXT = 'jpg'

/** 可派生变体的原图扩展名（gif/avif 刻意排除：动图变体会丢帧，AVIF 变体收益低） */
const DERIVABLE_EXT_RE = /^\.(jpe?g|png|webp)$/i

/** 已是变体的 URL（含 -thumbnail/-preview/-blur 后缀）—— 幂等判断 */
const VARIANT_SUFFIX_RE = /-(?:thumbnail|preview|blur)\.(?:jpe?g|png|webp)$/i

/** 本站上传路径：/uploads/<key>.<ext>（不含协议与查询串，由调用方拆分） */
const UPLOAD_PATH_RE = /^\/uploads\/(.+)\.([a-zA-Z0-9]+)$/

/**
 * 上传时已有专用变体、无需再派生的目录：
 * covers 主图是 2.6KB webp（另有 -preview.webp / -blur.jpg），avatars 同理（-preview.webp / -blur.jpg）。
 * 这两处派生出的 jpg 变体反而更大，属于负优化。
 */
const NO_DERIVE_DIRS = ['covers/', 'avatars/']

/**
 * 站点自身的 origin（用于区分「本站相对/绝对资源」与「CDN 外部资源」）。
 *
 * 判定口径只有两种来源：构建期内联的 NEXT_PUBLIC_API_BASE / NEXT_PUBLIC_SITE_URL，
 * 以及浏览器里的 window.location.origin。前两者服务端与客户端取值相同 → SSR 与
 * hydration 得到的变体 URL 一致（移动壳构建时 API base 必配，绝对 URL 也能派生）。
 * 只有「未配置基址却把绝对本站 URL 存进库」这种极端情况会两端不一致：
 * 此时 React 保留服务端渲染的原图地址，只是没走优化，功能不受影响。
 */
function siteOrigins(): string[] {
  const origins: string[] = []
  const envs = [process.env.NEXT_PUBLIC_API_BASE, process.env.NEXT_PUBLIC_SITE_URL]
  for (const raw of envs) {
    const value = String(raw || '').trim()
    if (!value) continue
    try {
      origins.push(new URL(value).origin)
    } catch {
      // 非法配置忽略（调用方按"外部资源"处理，行为安全）
    }
  }
  if (typeof window !== 'undefined' && window.location) {
    origins.push(window.location.origin)
  }
  return origins
}

function isSameSiteHost(host: string): boolean {
  return siteOrigins().some((origin) => {
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  })
}

/** 拆出可改写的站点内路径（不含 origin / 查询串 / hash）；不可改写返回 null */
function siteRelativePath(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  // 协议相对（//cdn/x.jpg）与 data:/blob: 一律视为外部资源
  if (trimmed.startsWith('//') || /^(?:data|blob):/i.test(trimmed)) return null

  if (trimmed.startsWith('/')) {
    // 相对路径：去掉查询串/hash（变体带 immutable 缓存，不需要原图的缓存击穿参数）
    return trimmed.split(/[?#]/)[0]
  }

  if (/^https?:\/\//i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      return null
    }
    // CDN / 第三方图床：原样返回（对象存储的变体由服务端下发，不在客户端拼）
    if (!isSameSiteHost(parsed.host)) return null
    return parsed.pathname
  }

  // 其它形态（相对文件名、未知协议）不预处理
  return null
}

/** 是否已经是变体 URL（幂等判断，供组件判断"接口已下发变体"） */
export function isVariantUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return VARIANT_SUFFIX_RE.test(url.split(/[?#]/)[0])
}

/**
 * 推导指定变体的 URL；不适用时返回 null（调用方据此回退原图）。
 *
 * 幂等：对已是变体的 URL 返回 null（"无需改写"），对可派生的原图返回**新 URL**，
 * 对上一次返回值再次调用同样返回 null —— 不会叠加 -thumbnail-thumbnail.jpg。
 */
export function deriveVariantUrl(
  url: string | null | undefined,
  variant: MediaVariant,
): string | null {
  if (!url) return null
  const pathname = siteRelativePath(url)
  if (!pathname) return null
  if (isVariantUrl(pathname)) return null

  const match = UPLOAD_PATH_RE.exec(pathname)
  if (!match) return null
  // base 已是不含扩展名的存储键（如 media/16），ext 是不带点的扩展名
  const [, base, ext] = match
  if (!DERIVABLE_EXT_RE.test('.' + ext)) return null
  if (NO_DERIVE_DIRS.some((dir) => base.startsWith(dir))) return null

  const variantPath = '/api/uploads/' + base + '-' + variant + '.' + VARIANT_EXT

  // 保留原 URL 的 origin（移动端本地壳里图片是服务端绝对地址）
  if (/^https?:\/\//i.test(url.trim())) {
    try {
      return new URL(url.trim()).origin + variantPath
    } catch {
      return variantPath
    }
  }
  return variantPath
}

/** 推导失败时的原图 URL（保证调用方永远拿到可渲染的地址） */
export function resolveVariantUrl(url: string, variant: MediaVariant): string
export function resolveVariantUrl(
  url: string | null | undefined,
  variant: MediaVariant,
): string | null
export function resolveVariantUrl(
  url: string | null | undefined,
  variant: MediaVariant,
): string | null {
  if (!url) return null
  return deriveVariantUrl(url, variant) ?? url
}

/**
 * 逐级回退链：首选变体 → preview → 原图（去重、去掉空值）。
 *
 * 为什么需要链：旧图可能只生成了部分变体（例如只在某次预览时生成过 preview），
 * 直接 404 就退回几 MB 原图太亏；先试 preview 往往仍能省 95% 流量。
 * 无任何变体可派生时返回 [原图]。
 */
export function variantChain(
  url: string | null | undefined,
  variant: MediaVariant,
): string[] {
  if (!url) return []
  const candidates: string[] = []
  const primary = deriveVariantUrl(url, variant)
  if (primary) candidates.push(primary)
  if (variant !== 'preview') {
    const preview = deriveVariantUrl(url, 'preview')
    if (preview) candidates.push(preview)
  }
  candidates.push(url)
  return Array.from(new Set(candidates))
}
