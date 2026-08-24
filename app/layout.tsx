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
        <meta name="theme-color" content="#FAFBF7" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <script src="/register-sw.js" defer />
      </head>
      <body className="min-h-screen flex flex-col">
        <LayoutContent>{children}</LayoutContent>
        <CommandPalette />
        <AppUpdatePrompt />
        <OfflineBootstrap />
      </body>
    </html>
  )
}

