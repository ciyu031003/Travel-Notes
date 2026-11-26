import type { ReactNode } from 'react'
// 空间模块视觉层；路由壳负责给「加载 / 无权限 / 404 / 错误」这些非 hero 状态
// 补系统状态栏高度（见 app/space/space.css 的 .space-route 规则）。
import '../space.css'

/**
 * 静态导出（Capacitor 移动端壳）需要为动态段声明可预渲染的参数。
 *
 * 这里只声明一个 `placeholder`：真实的空间 slug 是**每个用户自己的数据**，
 * 构建期无法枚举。移动端页面的架构因此与 `/travel/[slug]` 一致 ——
 * 构建期产出占位页，客户端读出 URL 里的 slug 后走
 * `GET /api/spaces/by-slug/<slug>` 取数据（见 components/space/SpaceDetailClient.tsx）。
 *
 * Web 端（服务端渲染）走的是 page.tsx 的直连服务层路径，不受这里影响。
 */
export function generateStaticParams() {
  return [{ slug: 'placeholder' }]
}

export default function Layout({ children }: { children: ReactNode }) {
  // .space-route > *:not([data-space])：hero（SpaceThemeScope 子树）自己用
  // .m-safe-top-16 避让状态栏，其余平铺状态由壳补 --m-system-top —— 两者不叠加。
  return <div className="space-route">{children}</div>
}
