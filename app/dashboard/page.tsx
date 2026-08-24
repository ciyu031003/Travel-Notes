'use client'

import { useEffect, useState } from 'react'
import DashboardClient, { type DashboardData } from '@/components/dashboard/DashboardClient'
import AsyncState from '@/components/AsyncState'
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
    return <AsyncState variant="error" message={error} title="数据看板加载失败" />
  }
  if (!data) {
    return <AsyncState variant="loading" message="正在汇总你的旅行数据…" />
  }
  return <DashboardClient data={data} />
}
