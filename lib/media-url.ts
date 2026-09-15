/**
 * 媒体 URL 绝对化（M0 · B1 上线修复）。
 *
 * 问题：移动端壳（Capacitor，页面源为 http(s)://localhost）内，服务端返回的相对媒体 URL
 * （/uploads/...、/api/images/N）会被解析到本地壳 → 404，导致 App 看不到任何图片/视频/封面。
 *
 * 方案：服务端在序列化出口统一把相对 URL 补成绝对地址（基于 NEXT_PUBLIC_SITE_URL，
 * 缺省回退 NEXT_PUBLIC_API_BASE）。Web 同源绝对 URL 无副作用；对象存储/CDN 的绝对 URL 原样返回。
 */

export function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/+$/, '')
}

/** 把相对媒体 URL 绝对化；已是绝对地址 / null / 空原样返回 */
export function absoluteMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('//')) return 'https:' + url
  if (url.startsWith('/')) {
    const base = siteBaseUrl()
    if (!base) return url
    return base + url
  }
  return url
}

/**
 * 由「存储键」（Media.storageKey，如 `media/abc.jpg`）计算公开访问 URL。
 * 对象存储配置下返回 {STORAGE_PUBLIC_BASE_URL|STORAGE_ENDPOINT}/{key}，否则返回 /uploads/{key}；
 * 二者都经 absoluteMediaUrl 绝对化（移动端本地壳需绝对地址，Web 同源无副作用）。
 *
 * 与各服务里散落的 storageKey→URL 逻辑保持一致，统一收敛到此处，避免漏加 /uploads/ 前缀或漏绝对化。
 */
export function storageKeyToUrl(storageKey: string | null | undefined): string | null {
  if (!storageKey) return null
  const key = storageKey.replace(/^\/+/, '')
  if (process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET) {
    const base = (process.env.STORAGE_PUBLIC_BASE_URL || process.env.STORAGE_ENDPOINT).replace(/\/+$/, '')
    return absoluteMediaUrl(`${base}/${key}`) ?? `${base}/${key}`
  }
  return absoluteMediaUrl(`/uploads/${key}`) ?? `/uploads/${key}`
}
