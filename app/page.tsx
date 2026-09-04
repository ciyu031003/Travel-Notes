'use client'

import HomeClient from '@/components/HomeClient'
import HomeMobile from '@/components/HomeMobile'
import AsyncState from '@/components/AsyncState'
import { useApi } from '@/lib/client/use-api'
import { apiUrl } from '@/lib/api-base'

interface HomeData {
  travelPosts: unknown[]
  anniversaries: unknown[]
  provincesVisitedCount: number
}

export default function HomePage() {
  // 阶段 A · A2：统一取数层（去重/取消/统一错误），服务端 Cache-Control 兜底浏览器缓存
  const { data, error, loading } = useApi<HomeData>(apiUrl('/api/home'))

  if (error) {
    return <AsyncState variant="error" message={error} title="首页加载失败" />
  }
  if (loading || !data) {
    return <AsyncState variant="loading" message="正在翻开你的旅行记忆…" />
  }
  return (
    <>
      <div className="hidden md:block">
        <HomeClient
          travelPosts={data.travelPosts as never[]}
          provincesVisitedCount={data.provincesVisitedCount}
          anniversaries={data.anniversaries as never[]}
        />
      </div>
      <div className="md:hidden">
        <HomeMobile
          travelPosts={data.travelPosts as never[]}
          provincesVisitedCount={data.provincesVisitedCount}
          anniversaries={data.anniversaries as never[]}
        />
      </div>
    </>
  )
}
