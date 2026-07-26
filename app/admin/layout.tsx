'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (pathname === '/admin/login' || pathname === '/admin/change-password' || pathname === '/admin/setup') {
      return
    }

    const checkStatus = async () => {
      try {
        const res = await fetch('/api/admin/check')
        if (res.ok) {
          const data = await res.json()
          if (!data.authenticated) {
            router.push('/admin/login')
          } else if (data.requirePasswordChange) {
            router.push('/admin/change-password')
          }
        } else {
          router.push('/admin/login')
        }
      } catch {
        router.push('/admin/login')
      }
    }

    checkStatus()
  }, [pathname, router])

  return <>{children}</>
}
