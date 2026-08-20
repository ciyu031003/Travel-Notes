'use client'

import { useEffect, useState } from 'react'
import DashboardClient, { type DashboardData } from '@/components/dashboard/DashboardClient'
import { apiUrl } from '@/lib/api-base'

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(apiUrl('/api/dashboard'))
      .then((r) => r.json())
      .then((j) => {
        if (j && j.error) setError(String(j.error))
        else setData(j as DashboardData)
      })
      .catch(() => setError('网络错误，请稍后重试'))
  }, [])

  if (error) {
    return <div className="container-custom flex min-h-[60vh] items-center justify-center text-gray-500">{error}</div>
  }
  if (!data) {
    return <div className="container-custom flex min-h-[60vh] items-center justify-center text-gray-500">加载中…</div>
  }
  return <DashboardClient data={data} />
}
