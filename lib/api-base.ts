/**
 * API 基址助手（Stage 3.0b 本地壳）。
 * 本地 webDir 壳下，相对路径 fetch('/api/...') 会打到 localhost，需改为服务器绝对地址；
 * Web 端（服务器同源部署）继续用相对路径。
 *
 * 移动端构建时通过 NEXT_PUBLIC_API_BASE 注入（如 http://106.55.2.197）。
 */

export function apiBase(): string {
  if (typeof window === 'undefined') return ''
  return (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/+$/, '')
}

/** 拼接完整 API 地址：本地壳返回绝对地址，Web 返回相对路径 */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : '/' + path
  return apiBase() + p
}
