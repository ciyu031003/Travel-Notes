'use client'

import DashboardClient, { type DashboardData } from '@/components/dashboard/DashboardClient'
import AsyncState from '@/components/AsyncState'
import { useApi } from '@/lib/client/use-api'
import { apiUrl } from '@/lib/api-base'

export default function DashboardPage() {
  // 阶段 A · A2：统一取数层
  const { data, error, loading } = useApi<DashboardData>(apiUrl('/api/dashboard'))

  if (error) {
    return <AsyncState variant="error" message={error} title="数据看板加载失败" />
  }
  if (loading || !data) {
    return <AsyncState variant="loading" message="正在汇总你的旅行数据…" />
  }
  return <DashboardClient data={data} />
}
