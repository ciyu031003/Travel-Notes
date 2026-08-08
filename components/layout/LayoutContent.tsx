'use client'

import { usePathname } from 'next/navigation'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'

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
  const isAdminPage = pathname.startsWith('/admin')
  const isForgotPasswordPage = pathname.startsWith('/forgot-password')
  const isNotesPage = pathname.startsWith('/notes')

  if (isLoginPage || isAdminPage || isForgotPasswordPage || isAlbumPage) {
    return <>{children}</>
  }

  if (isTravelPage) {
    return <>{children}</>
  }

  if (isHomePage) {
    return (
      <>
        <main className="flex-1">
          {children}
        </main>
      </>
    )
  }

  // /notes 主页采用全屏沉浸式深色布局，由页面内置导航，跳过全局 Navbar/Footer
  if (pathname === '/notes') {
    return (
      <>
        <main className="flex-1">
          {children}
        </main>
      </>
    )
  }

  return (
    <>
      <Navbar />
      <main className="flex-1 pt-20 pb-12">
        {children}
      </main>
      <Footer />
    </>
  )
}
