'use client'

import InkHome from '@/components/web/home/InkHome'
import type { InkHomeProps } from '@/components/web/home/types'

/**
 * 首页（桌面树）：HomePageClient 在 md:block 里渲染本组件，<768 的移动端走 HomeMobile。
 *
 * W4 起桌面端是**独立于移动端的设计主题**「Ink & Ivory」（墨色/象牙 + 玫瑰金/金），
 * 实现在 components/web/home/**：
 *  · InkHome.tsx —— Hero（大字衬线标题 + 双 CTA + 玻璃足迹面板）+ 12 列不对称四区块
 *                  （最近旅程 / 画册 / 票据 / 旅行圈）+ 每日一言/进行中/纪念日 + 页脚；
 *  · ink-home.css —— 全部颜色/渐变/阴影/动效（桌面语言只在 ≥1024 生效）；
 *  · ink-ui.tsx   —— Reveal（IO 一次性渐入）/ TiltCard（3D 倾斜）/ useIdleMount（空闲挂载）/ 内联 SVG 图标。
 * 本文件只保留 props 透传：数据仍全部来自 HomeData，不新增接口。
 */
export default function HomeClient(props: InkHomeProps) {
  return <InkHome {...props} />
}
