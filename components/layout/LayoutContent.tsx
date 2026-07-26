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
  const isAdminLoginPage = pathname === '/admin/login'

  if (isLoginPage || isAdminLoginPage) {
    return <>{children}</>
  }

  if (isTravelPage) {
    return <>{children}</>
  }

  if (isHomePage) {
    return (
      <>
        <Navbar variant="transparent" />
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
