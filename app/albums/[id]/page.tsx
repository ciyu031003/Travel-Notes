'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AlbumDetailPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/album')
  }, [router])
  return null
}
