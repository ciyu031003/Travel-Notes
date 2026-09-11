/**
 * 画册深链：/album?book=<bookKey>。
 * 首页画册目录（桌面 HomeBooks / 移动端 HomeMobile）与画册墙共用一个口径，
 * 打开画册即直达对应城市/旅行画册。
 */
export function albumDeepLink(bookKey: string): string {
  return `/album?book=${encodeURIComponent(bookKey)}`
}

/** 从当前页面 URL 解析 ?book= 参数（客户端专用，SSR/静态导出无 window 时返回 null）。 */
export function readBookKeyFromUrl(search: string): string | null {
  if (!search) return null
  try {
    const params = new URLSearchParams(search.slice(search.indexOf('?') + 1))
    return params.get('book')
  } catch {
    return null
  }
}
