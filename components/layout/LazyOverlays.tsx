'use client'

import dynamic from 'next/dynamic'

/**
 * 全局浮层懒加载收敛（P1-19 / P-4）
 * ============================================================================
 * 根布局此前静态挂载 9 个客户端组件，其中：
 *  · AppUpdatePrompt → BottomSheet → motion/react（38.7KB gz）：但无更新时它直接 return null；
 *  · Onboarding / PreferenceSurvey / CommandPalette：首屏 99% 概率用不到。
 * 它们却都在**每个页面**的初始 chunk 里。
 *
 * 这里统一收敛到一个客户端壳：内部用 next/dynamic(ssr:false) 切出独立 chunk，
 * 水合后再按需下载。layout.tsx 因此可以保持 Server Component（不再直接 import
 * 这些客户端组件）。
 *
 * ssr:false 是安全的：这些组件只做「水合后按条件弹层」，服务端渲染结果本来就是 null；
 * 若放在 Server Component 里反而会因为 dynamic ssr:false 不被允许而报错，所以必须
 * 由本 'use client' 文件承载。
 */
const AppUpdatePrompt = dynamic(() => import('@/components/offline/AppUpdatePrompt'), { ssr: false })
const Onboarding = dynamic(
  () => import('@/components/mobile/Onboarding').then((m) => ({ default: m.Onboarding })),
  { ssr: false },
)
const PreferenceSurvey = dynamic(
  () => import('@/components/mobile/PreferenceSurvey').then((m) => ({ default: m.PreferenceSurvey })),
  { ssr: false },
)
const CommandPalette = dynamic(() => import('@/components/command/CommandPalette'), { ssr: false })

export default function LazyOverlays() {
  return (
    <>
      <Onboarding />
      {/* 新用户偏好问卷：与首启引导互斥（等它退场后才上场），完成或跳过后不再弹 */}
      <PreferenceSurvey />
      <CommandPalette />
      <AppUpdatePrompt />
    </>
  )
}
