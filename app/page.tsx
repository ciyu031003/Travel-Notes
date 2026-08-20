'use client'

import { useEffect, useState } from 'react'
import HomeClient from '@/components/HomeClient'
import { apiUrl } from '@/lib/api-base'

interface HomeData {
  travelPosts: unknown[]
  anniversaries: unknown[]
  provincesVisitedCount: number
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(apiUrl('/api/home'))
      .then((r) => r.json())
      .then((j) => {
        if (j && j.error) setError(String(j.error))
        else setData(j as HomeData)
      })
      .catch(() => setError('网络错误，请稍后重试'))
  }, [])

  if (error) {
    return <div className="container-custom flex min-h-[60vh] items-center justify-center text-gray-500">{error}</div>
  }
  if (!data) {
    return <div className="container-custom flex min-h-[60vh] items-center justify-center text-gray-500">加载中…</div>
  }
  return (
    <HomeClient
      travelPosts={data.travelPosts as never[]}
      provincesVisitedCount={data.provincesVisitedCount}
      anniversaries={data.anniversaries as never[]}
    />
  )
}
