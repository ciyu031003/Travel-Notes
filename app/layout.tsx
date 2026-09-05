import type { Metadata } from 'next'
import './globals.css'
import LayoutContent from '@/components/layout/LayoutContent'
import CommandPalette from '@/components/command/CommandPalette'
import AppUpdatePrompt from '@/components/offline/AppUpdatePrompt'
import OfflineBootstrap from '@/components/offline/OfflineBootstrap'

export const metadata: Metadata = {
  title: '行迹 | 旅行记忆空间',
  description: '记录每一次出发与归来，沉淀属于你的旅行记忆。',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FAF6EE" />
        {/* favicon 由 app/icon.png / app/apple-icon.png 文件约定自动注入（源：public/brand/logo.png） */}
        <script src="/register-sw.js" defer />
      </head>
      <body className="min-h-screen flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-travel-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
        >
          跳到主内容
        </a>
        <LayoutContent>{children}</LayoutContent>
        <CommandPalette />
        <AppUpdatePrompt />
        <OfflineBootstrap />
      </body>
    </html>
  )
}

