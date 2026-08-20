'use client'

import { useEffect, useState } from 'react'
import TravelClient from './TravelClient'
import { apiUrl } from '@/lib/api-base'

export default function TravelPage() {
  const [posts, setPosts] = useState<unknown[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(apiUrl('/api/travels'))
      .then((r) => r.json())
      .then((j) => {
        if (j && j.error) setError(String(j.error))
        else setPosts(j?.posts || [])
      })
      .catch(() => setError('网络错误，请稍后重试'))
  }, [])

  if (error) {
    return <div className="container-custom flex min-h-[60vh] items-center justify-center text-gray-500">{error}</div>
  }
  if (!posts) {
    return <div className="container-custom flex min-h-[60vh] items-center justify-center text-gray-500">加载中…</div>
  }
  return <TravelClient posts={posts as never[]} />
}
