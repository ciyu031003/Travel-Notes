'use client'

import MeHome from '@/components/social/MeHome'
import AsyncState from '@/components/AsyncState'
import { useApi } from '@/lib/client/use-api'
import { apiUrl } from '@/lib/api-base'

export default function MePage() {
  // 阶段 A · A2：统一取数层（/api/me 为 ok() 包装，useApi 已自动解包 data）
  const { data: profile, error, loading } = useApi<any>(apiUrl('/api/me'))

  if (error) {
    return <AsyncState variant="error" message={error} title="个人档案加载失败" />
  }
  if (loading || !profile) {
    return <AsyncState variant="loading" message="正在加载你的旅行档案…" />
  }
  return <MeHome initial={profile} />
}
