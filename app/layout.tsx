import type { Metadata } from 'next'
import './globals.css'
import LayoutContent from '@/components/layout/LayoutContent'
import CommandPalette from '@/components/command/CommandPalette'

export const metadata: Metadata = {
  title: '我们的小家 | 旅行记录 & 共同回忆',
  description: '记录两个人的旅行足迹与共同回忆',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:wght@700;900&family=Noto+Serif+SC:wght@700;900&display=swap" rel="stylesheet" />
        <script src="/register-sw.js" defer />
      </head>
      <body className="min-h-screen flex flex-col">
        <LayoutContent>{children}</LayoutContent>
        <CommandPalette />
      </body>
    </html>
  )
}

