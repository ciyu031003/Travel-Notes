'use client'

import { usePathname } from 'next/navigation'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import MobileBottomNav from '@/components/layout/MobileBottomNav'

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

  // UI-V3 壳层收口：/me /circle /sync 接入底部导航（保留自绘 header），桌面不受影响（导航 md:hidden）
  if (isCirclePage || isMePage || isSyncPage) {
    return (
      <>
        {children}
        <MobileBottomNav />
      </>
    )
  }

  if (isTravelPage) {
    return (
      <>
        {children}
        <MobileBottomNav />
      </>
    )
  }

  if (isHomePage) {
    return (
      <>
        <Navbar />
        <main id="main-content" className="flex-1 pt-16 pb-14 md:pb-0">
          {children}
        </main>
        <MobileBottomNav />
      </>
    )
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="flex-1 pt-20 pb-20 md:pb-12">
        {children}
      </main>
      <Footer />
      <MobileBottomNav />
    </>
  )
}

