/**
 * 应用内链接解析（2026-10-16）。
 * ============================================================================
 * 背景：Capacitor 的本地服务器默认开启 html5mode，且实现是——
 *   if (path.equals("/") || (!lastPathSegment.contains(".") && html5mode)) → 返回 **根 index.html**
 * 也就是说，在原生壳里访问任何"末段不含点"的路径，拿到的都是首页。
 * 本项目是**多页静态导出**（产物是 moments.html / timeline.html 这样带扩展名的文件），
 * 不是 SPA 单壳，所以这个回落会把 /moments、/timeline 这类跳转变成"回到首页"——
 * 真机表现就是「点了那些按钮没反应」。
 *
 * 修法：在原生壳里把路径补成真实存在的 **.html** 文件（末段含点 → 跳过 html5mode → 命中真实文件）。
 * Web 端保持原路径不变（服务器有正常路由）。
 */
const NATIVE_SHELL_PATHS = new Set([
  '/travel', '/album', '/timeline', '/moments', '/dashboard', '/circle',
  '/me', '/me/favorites', '/me/notifications', '/me/settings', '/sync', '/space', '/search',
])

/** 原生壳里可用的 .html 路径；非壳环境或未知路径原样返回 */
export function appHref(path: string): string {
  if (typeof window === 'undefined') return path
  const shell = Boolean(process.env.NEXT_PUBLIC_API_BASE)
  if (!shell) return path
  if (!path.startsWith('/')) return path
  if (path.includes('?') || path.includes('#')) return path
  if (path.includes('.')) return path
  const clean = path.endsWith('/') ? path.slice(0, -1) : path
  return NATIVE_SHELL_PATHS.has(clean) ? clean + '.html' : path
}
