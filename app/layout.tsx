import type { Metadata, Viewport } from 'next'
import './globals.css'
import LayoutContent from '@/components/layout/LayoutContent'
import LazyOverlays from '@/components/layout/LazyOverlays'
import OfflineBootstrap from '@/components/offline/OfflineBootstrap'
import PrivacyLockGate from '@/components/offline/PrivacyLockGate'
import { ToastHost } from '@/components/mobile/Toast'
import ThemeColorSync from '@/components/mobile/ThemeColorSync'
import NativeBackHandler from '@/components/mobile/NativeBackHandler'

/**
 * 站点绝对地址：metadataBase / canonical / OG 图片解析都依赖它。
 * 生产由部署环境注入 NEXT_PUBLIC_SITE_URL；本地/预览缺省回退到 localhost（与 .env.example 一致），
 * 避免 new URL(undefined) 在构建期抛错。
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000'

/**
 * P1-21：全局 metadata。
 *  · metadataBase：让子页面用相对路径写 canonical/og:image（Next 会拼成绝对 URL）；
 *  · title.template：各页 generateMetadata 只写自己的标题，后缀由这里统一拼；
 *  · openGraph/twitter：分享到微信/Telegram 不再是"无标题裸链接"。
 * 图片用现有品牌图 /brand/logo-512.png（512×512，仓库内唯一成规模的品牌图；
 * 1200×630 专用 OG 图素材未入库，尺寸按真实文件标注，避免声明与实际不符）。
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: '甜途 | 旅行记忆空间',
    template: '%s | 甜途',
  },
  description: '记录每一次出发与归来，沉淀属于你的旅行记忆。',
  applicationName: '甜途',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    siteName: '甜途',
    url: '/',
    title: '甜途 | 旅行记忆空间',
    description: '记录每一次出发与归来，沉淀属于你的旅行记忆。',
    images: [
      {
        url: '/brand/logo-512.png',
        width: 512,
        height: 512,
        alt: '甜途',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '甜途 | 旅行记忆空间',
    description: '记录每一次出发与归来，沉淀属于你的旅行记忆。',
    images: ['/brand/logo-512.png'],
  },
}

/**
 * viewport-fit=cover：没有它 env(safe-area-inset-*) 在刘海屏/挖孔屏上恒为 0，
 * --m-safe-top 只剩固定 20px 兜底。
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FFFBF7',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 主题初始化必须阻塞首帧：否则暗色用户冷加载先画亮色底再被 Navbar 水合后翻转（闪白）。
            与 components/layout/Navbar.tsx 的恢复逻辑保持同一 key（localStorage.theme === 'dark'）。 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        {/* theme-color 由 viewport 导出注入，运行时由 ThemeColorSync 随暗色切换同步 */}
        {/* favicon 由 app/icon.png / app/apple-icon.png 文件约定自动注入（源：public/brand/logo.png） */}
        <script src="/register-sw.js" defer />
      </head>
      <body className="min-h-dvh flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus-visible:z-[100] focus:rounded-lg focus:bg-travel-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus-visible:shadow-lg"
        >
          跳到主内容
        </a>
        <LayoutContent>{children}</LayoutContent>
        <NativeBackHandler />
        <ThemeColorSync />
        {/* 常驻浮层（AppUpdatePrompt/Onboarding/PreferenceSurvey/CommandPalette）
            P1-19：已收敛到 lazy 客户端壳，首屏不再下载 motion / 这些组件的 chunk。 */}
        <LazyOverlays />
        {/* C1：冷启动隐私锁门禁（仅原生壳 + 已设 PIN 时出锁；Web 恒不渲染） */}
        <PrivacyLockGate />
        <OfflineBootstrap />
        <ToastHost />
      </body>
    </html>
  )
}
