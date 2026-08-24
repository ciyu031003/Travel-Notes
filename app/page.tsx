'use client'

import { useEffect, useState } from 'react'
import HomeClient from '@/components/HomeClient'
import AsyncState from '@/components/AsyncState'
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
    return <AsyncState variant="error" message={error} title="首页加载失败" />
  }
  if (!data) {
    return <AsyncState variant="loading" message="正在翻开你的旅行记忆…" />
  }
  return (
    <HomeClient
      travelPosts={data.travelPosts as never[]}
      provincesVisitedCount={data.provincesVisitedCount}
      anniversaries={data.anniversaries as never[]}
    />
  )
}
