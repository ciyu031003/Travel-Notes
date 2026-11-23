import type { Metadata, Viewport } from 'next'
import './globals.css'
import LayoutContent from '@/components/layout/LayoutContent'
import DesktopChrome from '@/components/layout/DesktopChrome'
import LazyOverlays from '@/components/layout/LazyOverlays'
import OfflineBootstrap from '@/components/offline/OfflineBootstrap'
import PrivacyLockGate from '@/components/offline/PrivacyLockGate'
import { ToastHost } from '@/components/mobile/Toast'
import ThemeColorSync from '@/components/mobile/ThemeColorSync'
import NativeBackHandler from '@/components/mobile/NativeBackHandler'
import CrashReportListener from '@/components/CrashReportListener'

/**
 * 站点绝对地址：metadataBase / canonical / OG 图片解析都依赖它。
 * 生产由部署环境注入 NEXT_PUBLIC_SITE_URL；本地/预览缺省回退到 localhost（与 .env.example 一致），
 * 避免 new URL(undefined) 在构建期抛错。
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000'

/**
 * 移动壳内的接口源（E2，2026-11-23）
 * ---------------------------------------------------------------------------
 * Android 壳里页面是从本地 assets 加载的（capacitor://localhost 之类），
 * 接口走 NEXT_PUBLIC_API_BASE 指向的公网域名（生产是 https://travel-notes.yuanabd.cn）。
 * 跨源首包要多付一次 DNS + TCP + TLS（弱网下 300~800ms），且 /api/check-auth 这类
 * 请求就在首屏关键路径上。这里在 <head> 里提前建连（dns-prefetch 给不认 preconnect 的旧壳兜底）。
 *
 * Web 部署（服务器同源）NEXT_PUBLIC_API_BASE 为空 → 不输出任何预连接，零副作用。
 * crossOrigin 用 use-credentials：接口全部是 credentials: 'include' 的带 Cookie 请求，
 * 不带凭证预连接的连接不会被复用。
 */
function resolveApiOrigin(): string | null {
  const raw = (process.env.NEXT_PUBLIC_API_BASE || '').trim().replace(/\/+$/, '')
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  } catch {
    return null
  }
}
const apiOrigin = resolveApiOrigin()

/**
 * P1-21：全局 metadata。
 *  · metadataBase：让子页面用相对路径写 canonical/og:image（Next 会拼成绝对 URL）；
 *  · title.template：各页 generateMetadata 只写自己的标题，后缀由这里统一拼；
 *  · openGraph/twitter：分享到微信/Telegram 不再是"无标题裸链接"。
 * 图片用专用 1200×630 OG 图 /brand/og-1200x630.png（B12 用 sharp 从品牌 logo
 * + 品牌色板生成，约 82KB；尺寸与真实文件一致，避免声明与实际不符）。
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
        url: '/brand/og-1200x630.png',
        width: 1200,
        height: 630,
        alt: '甜途 · 旅行记忆空间',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '甜途 | 旅行记忆空间',
    description: '记录每一次出发与归来，沉淀属于你的旅行记忆。',
    images: ['/brand/og-1200x630.png'],
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
        {/* 低端设备标记（P-10）：prefers-reduced-transparency 在 Chromium/Android WebView
            不生效，低端机上的常驻玻璃模糊永不降级 —— 用运行时能力探测补上降级路径，
            CSS 侧见 mobile.css 的 html.low-end .m-glass 规则。deviceMemory 仅 Chromium 提供，
            缺省时只看核心数；两项都拿不到（iOS Safari）则不打标，维持现状。 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var n=navigator,dm=n.deviceMemory,hc=n.hardwareConcurrency;if((dm&&dm<=4)||(hc&&hc<=4)){document.documentElement.classList.add('low-end')}}catch(e){}`,
          }}
        />
        {/* E2：壳内接口跨源 → 提前建连，省掉首个 /api 请求的 DNS+TCP+TLS 往返 */}
        {apiOrigin && (
          <>
            <link rel="preconnect" href={apiOrigin} crossOrigin="use-credentials" />
            <link rel="dns-prefetch" href={apiOrigin} />
          </>
        )}
        {/*
          E2：字体预加载 —— 实测后**没有**加，原因记录在这里，避免以后重复踩：
          Source Serif 4 子集（29KB）虽然是所有移动页大标题的首选字体，但补齐 unicode-range
          之后它已经不在首屏渲染的关键路径上（CJK 直接走系统回退）。给整个根布局加
          <link rel="preload" as="font"> 会和 CSS/JS 抢同一条 0.8Mbps 带宽，实测（www 补丁模拟，
          4×CPU + 0.8Mbps + API 500ms，3 次中位）：
            /album  FCP 3116ms（不预加载） → 4800ms（default 优先级） → 4800ms（fetchPriority=low）
            /travel FCP 1296ms（不预加载） → 1576ms（default 优先级） → 1520ms（fetchPriority=low）
          因此这里保持不预加载；字体本身的收益来自「子集化 + unicode-range」（105KB→29KB 且
          中文不再触发加载）。若后续测量口径变成「资源全本地（APK）」且想再试，加回一行即可。
        */}
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
        <DesktopChrome>
          <LayoutContent>{children}</LayoutContent>
        </DesktopChrome>
        <NativeBackHandler />
        <ThemeColorSync />
        {/* 全局崩溃/未捕获异常上报（P-07 后半）：server component 布局经客户端壳挂载，全站生效 */}
        <CrashReportListener />
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