'use client'

import { useEffect, useState, useCallback } from 'react'
import TravelClient from './TravelClient'
import TravelMobileClient from './TravelMobileClient'
import TravelComposer from '@/components/travel/TravelComposer'
import AsyncState from '@/components/AsyncState'
import { apiUrl } from '@/lib/api-base'
import { readWithFallback } from '@/lib/modules/offline/repository'
import { readLocalTravels } from '@/lib/modules/offline/travel-read'
import { isNativePlatform } from '@/lib/modules/offline/platform'

export default function TravelPage() {
  const [posts, setPosts] = useState<unknown[] | null>(null)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(false)
  const [autoCompose, setAutoCompose] = useState(false)

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('compose') === '1') {
        setAutoCompose(true)
        params.delete('compose')
        const next = params.toString()
        window.history.replaceState({}, '', window.location.pathname + (next ? '?' + next : '') + window.location.hash)
      }
    }
  }, [])

  if (error) {
    return <AsyncState variant="error" message={error} title="旅行记录加载失败" />
  }
  if (!posts) {
    return <AsyncState variant="loading" message="正在加载旅行记录…" />
  }
  return (
    <>
      {isNativePlatform() && (
        <div className="fixed right-4 top-16 z-40">
          <TravelComposer onCreated={load} />
        </div>
      )}
      {!isNativePlatform() && autoCompose && (
        <div className="fixed inset-x-0 bottom-0 z-[60] p-3 md:hidden">
          <div className="m-card mx-auto max-w-md p-4">
            <TravelComposer
              onCreated={load}
              autoOpen
              hideTrigger
              onClose={() => setAutoCompose(false)}
            />
          </div>
        </div>
      )}
      <div className="hidden md:block">
        <TravelClient posts={posts as never[]} offline={offline} />
      </div>
      <div className="md:hidden">
        <TravelMobileClient posts={posts as never[]} offline={offline} />
      </div>
    </>
  )
}
