import { normalizeCoverUrl } from '@/components/china-map/cover-url'

/**
 * 旅行 / 旧文章详情页的「顶部封面」URL 解析（Web 桌面端英雄图用）。
 *
 * 为什么需要它（用户 bug：地图 → 省份 → 城市 → 点开文章，顶部图片空白）：
 *  1. 详情接口同时下发三种口径的封面：coverUrl（服务端规范化后的地址）、
 *     cover（**未规范化的原值**，可能是 /uploads 相对路径、COS 绝对 URL，甚至裸存储键），
 *     以及 images[]（封面 + 回忆照片，已绝对化）。桌面端此前只把 images 铺成一张 4 列小网格，
 *     单张封面时就是 183×183 缩在左上角 —— 看起来正是「上方图片空白」。
 *  2. 旧文章（Post）常常**没有 cover 字段**，首图只存在正文 HTML 里（img src）。
 *  3. 相对路径 / 绝对 URL 混用：App 壳与 Web 的解析基准不同，必须先绝对化。
 *
 * 归一化实现与服务端媒体口径一致，见 components/china-map/cover-url.ts（与地图缩略图共用）。
 */

/** 正文 HTML 里第一张图片的 src（旧文章的封面常常只在正文里） */
const FIRST_IMG_RE = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i

export { normalizeCoverUrl }

export interface CoverCandidateSource {
  /** 服务端规范化后的封面地址（优先） */
  coverUrl?: string | null
  /** 未规范化的原始封面值 */
  cover?: string | null
  /** 详情接口的图片数组（封面 + 回忆照片） */
  images?: readonly (string | null | undefined)[] | null
  /** 正文 HTML（旧文章兜底取正文首图） */
  contentHtml?: string | null
}

/** 解析详情页顶部封面；全部候选都不可用时返回 null */
export function resolveCoverUrl(source: CoverCandidateSource): string | null {
  const ordered: (string | null | undefined)[] = [source.coverUrl, source.cover, ...(source.images ?? [])]
  for (const candidate of ordered) {
    const url = normalizeCoverUrl(candidate ?? null)
    if (url) return url
  }
  const match = FIRST_IMG_RE.exec(source.contentHtml || '')
  if (match) return normalizeCoverUrl(match[1])
  return null
}
