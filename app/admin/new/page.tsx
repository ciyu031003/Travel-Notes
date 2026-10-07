'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminNewPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/admin/edit/new')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-warm-900">
      <div className="text-warm-500">跳转中...</div>
    </div>
  )
}
