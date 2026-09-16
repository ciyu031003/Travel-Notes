import type { BookSpread } from './types'

/**
 * 邻页预热（Album 2.0 M2）
 *
 * 为什么不放在组件里：page-flip 会把**所有**页元素一次性载入 DOM
 * （portrait 模式还会克隆页元素——上游 README 明说 "uses cloning of html elements"），
 * 因此「只渲染 current ± 1」在 page-flip 内部做不到。等价的有效手段是控制**网络与解码**：
 *   · 未进入视口的图不设 src（见 components/album/reader/LazyArtImage.tsx）；
 *   · 当前跨页前后的图离屏 `img.decode()` 预热，翻到时已是解码好的位图；
 *   · 预热窗口固定为 ±1，绝不随画册总页数增长
 *     （上游 react-pageflip issue #14 的教训正是"初始化时请求所有图片"）。
 *
 * 本模块是纯逻辑 + 一处浏览器 API（`Image`），因此可以在 node 环境单测。
 */

/** 预热窗口：当前跨页 ± 1 */
export const PRELOAD_RADIUS = 1

/** 已解码过的 URL（避免重复 decode；上限内按插入序淘汰最旧） */
const decoded = new Set<string>()
const DECODED_MAX = 400

function rememberDecoded(url: string) {
  decoded.add(url)
  if (decoded.size > DECODED_MAX) {
    const oldest = decoded.values().next().value
    if (oldest !== undefined && oldest !== url) decoded.delete(oldest)
  }
}

/** 从一张跨页里取出待加载的图片 URL（优先 PREVIEW，退化 THUMBNAIL；左右两页都取） */
export function spreadUrls(spread: BookSpread | undefined): string[] {
  if (!spread) return []
  const urls: string[] = []
  for (const page of [spread.left, spread.right]) {
    for (const photo of page?.photos ?? []) {
      const url = photo.previewUrl || photo.thumbnailUrl
      if (url) urls.push(url)
    }
  }
  return urls
}

/**
 * 计算需要预热的 URL 列表（纯函数，便于单测"只预热 ±1 且不重复"这条契约）。
 * 不含当前跨页自身（它已在上屏路径上）；不越界；跳过已解码过的 URL。
 */
export function collectPreloadUrls(
  spreads: BookSpread[],
  currentIndex: number,
  alreadyDecoded: ReadonlySet<string> = new Set(),
): string[] {
  if (spreads.length === 0) return []
  const from = Math.max(0, currentIndex - PRELOAD_RADIUS)
  const to = Math.min(spreads.length - 1, currentIndex + PRELOAD_RADIUS)
  const out: string[] = []
  const seen = new Set<string>()
  for (let i = from; i <= to; i++) {
    if (i === currentIndex) continue
    for (const url of spreadUrls(spreads[i])) {
      if (alreadyDecoded.has(url) || seen.has(url)) continue
      seen.add(url)
      out.push(url)
    }
  }
  return out
}

/**
 * 预热当前跨页前后的图片（`img.decode()`：MDN 明确推荐的照片相册用法——
 * 先离屏解码再上屏，避免翻到时解码卡顿）。
 *
 * @returns 本次实际发起预热的 URL（测试 / 诊断用）
 */
export function preloadAdjacentSpreads(spreads: BookSpread[], currentIndex: number): string[] {
  if (typeof window === 'undefined') return []
  const urls = collectPreloadUrls(spreads, currentIndex, decoded)
  for (const url of urls) {
    rememberDecoded(url)
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    // decode() 在部分内核上对未 attach 的图会 reject；失败静默即可（HTTP 缓存已写入）
    void img.decode?.().catch(() => {})
  }
  return urls
}

/** 清空解码记忆（测试用） */
export function resetPreloadCache(): void {
  decoded.clear()
}
