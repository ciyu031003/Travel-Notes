import type { Metadata } from 'next'
import SpaceDetailClient from '@/components/space/SpaceDetailClient'

export const metadata: Metadata = {
  title: '空间详情',
  robots: { index: false, follow: false },
}

/**
 * 空间详情页（/space/[slug]）
 *
 * **架构说明（与 `/travel/[slug]` 一致）**：这一层刻意只渲染「客户端壳」。
 *
 * 原因是移动端：Capacitor 壳是 `output: 'export'` 静态站点，没有 Node 服务端，
 * 带动态段的服务端组件在导出构建里会直接失败（构建期只产出 `generateStaticParams`
 * 声明的占位页，拿不到真实 slug，也读不到登录 Cookie）。
 * 因此取数放在客户端壳里，走 `GET /api/spaces/by-slug/<slug>`：
 *   · Web：服务端把壳渲染成 HTML，客户端再取数；
 *   · 移动端：静态页 + 同一套取数逻辑，壳内可用。
 *
 * 代价是首屏多一次 API 往返（壳内已有加载态）；收益是**两端同一份实现**，
 * 不会再出现「网页有、App 没有」的漂移。
 */
export default function SpaceDetailPage() {
  return <SpaceDetailClient />
}
