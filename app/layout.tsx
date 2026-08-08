import type { Metadata } from 'next'
import './globals.css'
import LayoutContent from '@/components/layout/LayoutContent'

export const metadata: Metadata = {
  title: '个人博客 | 旅行记录 & 学习笔记',
  description: '记录旅行足迹，分享学习笔记、思维导图和项目代码',
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
      </head>
      <body className="min-h-screen flex flex-col">
        <LayoutContent>{children}</LayoutContent>
      </body>
    </html>
  )
}
