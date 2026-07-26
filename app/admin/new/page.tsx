'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminNewPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/admin/edit/new')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-gray-500">跳转中...</div>
    </div>
  )
}
