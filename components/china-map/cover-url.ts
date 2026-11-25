import { absoluteMediaUrl } from '@/lib/media-url'

/**
 * 封面/缩略图地址归一化（地图弹层与文章详情页共用）。
 *
 * 为什么要有它：数据库里同一条记录的封面可能长三种样子——
 *   · 服务端规范化后的绝对 URL（COS/CDN，https://…）；
 *   · 站内相对路径（/uploads/media/x.jpg、/api/images/3）；
 *   · 未处理的裸存储键（media/x.jpg）。
 * 直接丢给 next/image 或 img，前两种还行、第三种必然 404；而 next/image 遇到
 * 未在 next.config images.remotePatterns 里的远端域名会**抛错**（整块弹层白掉）。
 * 这里统一成一个「保证可渲染」的地址，配合纯 img 渲染 + onError 兜底，
 * 从此换存储/CDN 不需要再改渲染层。
 */
const IMAGE_EXT_RE = /\.(?:jpe?g|png|webp|avif|gif)(?:[?#].*)?$/i

export function normalizeCoverUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  let value = String(raw).trim()
  if (!value) return null
  if (/^(?:data|blob):/i.test(value)) return null
  if (value.startsWith('//')) value = 'https:' + value
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('/')) return absoluteMediaUrl(value)
  // 裸存储键：补 /uploads/ 前缀（与服务端 storageKeyToUrl 的公开路径口径一致）
  if (IMAGE_EXT_RE.test(value)) {
    const key = value.replace(/^\.?\//, '').replace(/^uploads\//i, '')
    return absoluteMediaUrl('/uploads/' + key)
  }
  return null
}
