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

/**
 * 空间详情地址。
 *
 * ⚠️ 与旅行同理，本地壳必须走查询参数版 `/space/detail?slug=…`：
 * `output: 'export'` 只为 `generateStaticParams` 声明的路径产出 HTML，
 * 而空间 slug 是**每个用户自己的数据**，构建期无法枚举 ——
 * 直接拼 `/space/<slug>` 在静态站里取不到文件，WebView 会 404/回落首页。
 * （这一条是我在 1.16.0 里踩过的坑：只加了 layout 的占位参数，
 *   却把 href 拼成了动态路径，导致真机点空间卡片进不去。）
 */
export function spaceDetailHref(slug: string): string {
  const s = encodeURIComponent(slug)
  return isMobileShell() ? `/space/detail?slug=${s}` : `/space/${s}`
}

/** 运行时平台探测（浏览器环境，供需要在非静态导出场景判断的平台逻辑使用）。 */
export function isNativeRuntime(): boolean {
  return typeof window !== 'undefined' && isNativePlatform()
}

/**
 * 旅行圈「某条旅行故事」的地址。
 *
 * 为什么要有这个助手：多个入口原先各自写 `'/circle/' + p.id`。
 * 一旦 `id` 缺失（接口少字段、离线缓存的旧结构、后台表格里关联对象为空），
 * 就会得到 `/circle/undefined` —— 用户看到的是"点进去没有内容"，
 * 而我们连日志都拿不到（URL 看起来是合法的）。
 *
 * ⚠️ 本地壳必须走查询参数版 `/circle/detail?postId=…`：
 * `output: 'export'` 只为 `generateStaticParams` 声明的路径产出 HTML（目前仅 `/circle/0`），
 * 点任意卡片去 `/circle/123` 在静态站里取不到文件，WebView 会回落到首页 ——
 * 真机反馈的"旅行圈点击后直接跳到首页、没办法阅览"就是这个。
 */
export function circlePostHref(postId: number | string | null | undefined): string | null {
  const n = Number(postId)
  // 必须是正整数主键：0.5 / '12abc' 这类脏值一律不算（否则会拼出 /circle/0.5）
  if (!Number.isInteger(n) || n <= 0) return null
  return isMobileShell() ? `/circle/detail?postId=${n}` : `/circle/${n}`
}

/** 旅行圈「某位用户的主页」地址（本地壳同样需要查询参数版） */
export function circleUserHref(userId: number | string | null | undefined): string | null {
  const n = Number(userId)
  if (!Number.isInteger(n) || n <= 0) return null
  return isMobileShell() ? `/circle/user-detail?id=${n}` : `/circle/user/${n}`
}

/** 卡片/通知点开旅行圈的统一入口：宁可退到旅行详情，也不跳到一个空页面 */
export function resolveTravelStoryHref(input: {
  postId?: number | string | null
  slug?: string | null
}): string | null {
  return circlePostHref(input.postId) ?? (input.slug ? travelDetailHref(input.slug) : null)
}
