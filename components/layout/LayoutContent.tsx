'use client'

import { usePathname } from 'next/navigation'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import MobileBottomNav from '@/components/layout/MobileBottomNav'
import { cn } from '@/lib/utils'

export default function LayoutContent({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isTravelPage = pathname.startsWith('/travel')
  const isHomePage = pathname === '/'
  const isLoginPage = pathname === '/login'
  const isAlbumPage = pathname.startsWith('/album')
  const isCirclePage = pathname.startsWith('/circle')
  const isMePage = pathname.startsWith('/me')
  const isSyncPage = pathname.startsWith('/sync')
  const isAdminPage = pathname.startsWith('/admin')
  const isForgotPasswordPage = pathname.startsWith('/forgot-password')
  if (isLoginPage || isAdminPage || isForgotPasswordPage || isAlbumPage) {
    return <>{children}</>
  }

  // 四个主导航 Tab：移动端各自携带页面级 header / hero，底部统一走 MobileBottomNav。
  // 桌面端壳层不受影响。
  if (isHomePage) {
    return (
      <>
        <div className="hidden md:block">
          <Navbar />
        </div>
        <main id="main-content" className="flex-1 pt-0 md:pt-16">
          {children}
        </main>
        <MobileBottomNav />
      </>
    )
  }

  if (isTravelPage || isCirclePage || isMePage || isSyncPage) {
    return (
      <>
        {children}
        <MobileBottomNav />
      </>
    )
  }

  // 次级页面（时间线 / 碎碎念 / 搜索等）：移动端仍保留全局导航用于返回与设置，
  // 但页脚仅在桌面展示，移动端不显示 Web 版页脚。
  return (
    <>
      <Navbar />
      <main id="main-content" className="flex-1 pt-20 pb-24 md:pb-12">
        {children}
      </main>
      <div className="hidden md:block">
        <Footer />
      </div>
      <MobileBottomNav />
    </>
  )
}

