import { isNativePlatform } from '@/lib/modules/offline/platform'

/**
 * 移动端本地壳路由助手。
 *
 * Web（服务器 SSR/SSG）使用 /travel/[slug] 动态路由；
 * 移动端本地壳（MOBILE_EXPORT）只有 /travel/placeholder.html，真实 slug 无法命中，
 * 因此必须改用 query 参数路由 /travel/detail?slug=...（静态可导出）。
 *
 * NEXT_PUBLIC_APP_PLATFORM 在 scripts/build-mobile.cjs 中编译期注入 'mobile'，
 * 而 process.env.NEXT_PUBLIC_* 会被构建期内联，避免客户端 hydration 不一致。
 */
export function isMobileShell(): boolean {
  return process.env.NEXT_PUBLIC_APP_PLATFORM === 'mobile'
}

export function travelDetailHref(slug: string): string {
  const s = encodeURIComponent(slug)
  return isMobileShell() ? `/travel/detail?slug=${s}` : `/travel/${s}`
}

export function travelRecordHref(slug: string): string {
  const s = encodeURIComponent(slug)
  return isMobileShell() ? `/travel/record?slug=${s}` : `/travel/${s}/record`
}

/** 运行时平台探测（浏览器环境，供需要在非静态导出场景判断的平台逻辑使用）。 */
export function isNativeRuntime(): boolean {
  return typeof window !== 'undefined' && isNativePlatform()
}
