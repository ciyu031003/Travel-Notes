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
      <body className="min-h-screen flex flex-col">
        <LayoutContent>{children}</LayoutContent>
      </body>
    </html>
  )
}
