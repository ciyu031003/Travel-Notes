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
  const isAdminPage = pathname.startsWith('/admin')
  const isForgotPasswordPage = pathname.startsWith('/forgot-password')
  if (isLoginPage || isAdminPage || isForgotPasswordPage || isAlbumPage || isCirclePage || isMePage) {
    return <>{children}</>
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
        <main className="flex-1 pt-16 pb-14 md:pb-0">
          {children}
        </main>
        <MobileBottomNav />
      </>
    )
  }

  return (
    <>
      <Navbar />
      <main className="flex-1 pt-20 pb-20 md:pb-12">
        {children}
      </main>
      <Footer />
      <MobileBottomNav />
    </>
  )
}

