'use client'

import { useEffect, useState, useCallback } from 'react'
import TravelClient from './TravelClient'
import TravelMobileClient, { TravelMobileLoading } from './TravelMobileClient'
import AsyncState from '@/components/AsyncState'
import { apiUrl } from '@/lib/api-base'
import { readWithFallback } from '@/lib/modules/offline/repository'
import { readLocalTravels } from '@/lib/modules/offline/travel-read'

export default function TravelPage() {
  const [posts, setPosts] = useState<unknown[] | null>(null)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await readWithFallback<unknown[]>(
        async () => {
          const res = await fetch(apiUrl('/api/travels'), { credentials: 'include', cache: 'no-cache' })
          if (!res.ok) throw new Error('http ' + res.status)
          const j = await res.json()
          if (j && j.error) throw new Error(String(j.error))
          return j?.posts || []
        },
        async () => {
          const local = await readLocalTravels()
          return local as unknown[] | null
        },
      )
      setPosts(result.data)
      setOffline(result.source === 'local')
    } catch {
      setError('网络错误，请稍后重试')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) {
    return (
      <>
        <div className="hidden md:block">
          <AsyncState variant="error" message={error} title="旅行记录加载失败" />
        </div>
        <div className="md:hidden">
          <TravelMobileLoading message={error} />
        </div>
      </>
    )
  }
  if (!posts) {
    return (
      <>
        <div className="hidden md:block">
          <AsyncState variant="loading" message="正在加载旅行记录…" />
        </div>
        <div className="md:hidden">
          <TravelMobileLoading />
        </div>
      </>
    )
  }
  return (
    <>
      <div className="hidden md:block">
        <TravelClient posts={posts as never[]} offline={offline} />
      </div>
      <div className="md:hidden">
        <TravelMobileClient posts={posts as never[]} offline={offline} onRefresh={load} />
      </div>
    </>
  )
}
