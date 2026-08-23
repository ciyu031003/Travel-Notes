'use client'

import { useEffect, useState, useCallback } from 'react'
import TravelClient from './TravelClient'
import TravelComposer from '@/components/travel/TravelComposer'
import { apiUrl } from '@/lib/api-base'
import { readWithFallback } from '@/lib/modules/offline/repository'
import { readLocalTravels } from '@/lib/modules/offline/travel-read'
import { isNativePlatform } from '@/lib/modules/offline/platform'

export default function TravelPage() {
  const [posts, setPosts] = useState<unknown[] | null>(null)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await readWithFallback<unknown[]>(
        async () => {
          const res = await fetch(apiUrl('/api/travels'), { credentials: 'include' })
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
    return <div className="container-custom flex min-h-[60vh] items-center justify-center text-gray-500">{error}</div>
  }
  if (!posts) {
    return <div className="container-custom flex min-h-[60vh] items-center justify-center text-gray-500">加载中…</div>
  }
  return (
    <>
      {isNativePlatform() && (
        <div className="fixed right-4 top-16 z-40">
          <TravelComposer onCreated={load} />
        </div>
      )}
      <TravelClient posts={posts as never[]} offline={offline} />
    </>
  )
}
